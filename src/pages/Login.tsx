import { useState, FormEvent, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Loader2, AlertTriangle, ShieldAlert, LockIcon } from 'lucide-react';

// Format a date string as a relative time (e.g., "in 30 minutes")
const formatRelativeTime = (dateString: string): string => {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const diffMins = Math.round(diffMs / (1000 * 60));
  
  if (diffMins <= 0) return 'now';
  if (diffMins < 60) return `in ${diffMins} minute${diffMins !== 1 ? 's' : ''}`;
  
  const diffHours = Math.round(diffMins / 60);
  return `in ${diffHours} hour${diffHours !== 1 ? 's' : ''}`;
};

const Login = () => {
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [timeUntilUnlock, setTimeUntilUnlock] = useState<string | null>(null);
  const { login, error, rateLimitInfo } = useAuth();
  const navigate = useNavigate();
  
  // Update the countdown timer if we're rate limited
  useEffect(() => {
    if (!rateLimitInfo?.resetTime) return;
    
    setTimeUntilUnlock(formatRelativeTime(rateLimitInfo.resetTime));
    
    const interval = setInterval(() => {
      setTimeUntilUnlock(formatRelativeTime(rateLimitInfo.resetTime!));
    }, 60000); // Update once per minute
    
    return () => clearInterval(interval);
  }, [rateLimitInfo]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    try {
      const success = await login(password);
      if (success) {
        navigate('/');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader>
          <CardTitle className="text-2xl font-bold text-center">Shopping List Login</CardTitle>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            {/* Rate limiting alert */}
            {rateLimitInfo?.locked && (
              <Alert variant="destructive" className="mb-4">
                <ShieldAlert className="h-4 w-4" />
                <AlertTitle>IP Temporarily Blocked</AlertTitle>
                <AlertDescription>
                  <div className="space-y-2">
                    <p>Too many failed login attempts. Your IP address is temporarily blocked.</p>
                    <p className="font-semibold">
                      <LockIcon className="inline-block mr-1 h-4 w-4" />
                      Try again {timeUntilUnlock}
                    </p>
                  </div>
                </AlertDescription>
              </Alert>
            )}
            
            {/* Warning about attempts remaining */}
            {rateLimitInfo?.attemptsLeft !== undefined && rateLimitInfo.attemptsLeft > 0 && rateLimitInfo.attemptsLeft <= 3 && (
              <Alert className="mb-4 border-amber-500 text-amber-700 bg-amber-50">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  Warning: You have {rateLimitInfo.attemptsLeft} attempt{rateLimitInfo.attemptsLeft !== 1 ? 's' : ''} remaining before temporary lockout.
                </AlertDescription>
              </Alert>
            )}
            
            {/* Regular error message */}
            {error && !rateLimitInfo?.locked && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <div className="space-y-2">
              <label htmlFor="password" className="text-sm font-medium text-gray-700">
                Password
              </label>
              <Input
                id="password"
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoFocus
                disabled={isSubmitting}
              />
            </div>
          </CardContent>
          <CardFooter>
            <Button 
              type="submit" 
              className="w-full" 
              disabled={isSubmitting || (rateLimitInfo?.locked === true)}
            >
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {rateLimitInfo?.locked ? 'IP Blocked' : 'Login'}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
};

export default Login;
