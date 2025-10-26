import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { API_CONFIG } from '@/config/api-config';

// Local storage keys
const PASSWORD_STORAGE_KEY = 'shopping-list-password';
const LOCKOUT_STORAGE_KEY = 'shopping-list-locked-until';

// Rate limit response interface
interface RateLimitInfo {
  attemptsLeft?: number;
  resetTime?: string;
  locked?: boolean;
}

// Authentication context interface
interface AuthContextType {
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  rateLimitInfo: RateLimitInfo | null;
  login: (password: string) => Promise<boolean>;
  logout: () => void;
}

// Create the context with a default value
const AuthContext = createContext<AuthContextType>({
  isAuthenticated: false,
  isLoading: true,
  error: null,
  rateLimitInfo: null,
  login: async () => false,
  logout: () => {},
});

// Props for the AuthProvider component
interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [rateLimitInfo, setRateLimitInfo] = useState<RateLimitInfo | null>(null);

  // Function to verify a password with the backend
  const verifyPassword = async (password: string): Promise<{
    valid: boolean;
    rateLimitInfo?: RateLimitInfo;
  }> => {
    try {
      const response = await fetch(`${API_CONFIG.BASE_URL}/auth/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ password }),
      });

      // Handle rate limiting response (HTTP 429)
      if (response.status === 429) {
        const errorData = await response.json();
        // Store lockout time in localStorage
        if (errorData.resetTime) {
          localStorage.setItem(LOCKOUT_STORAGE_KEY, errorData.resetTime);
        }
        return {
          valid: false,
          rateLimitInfo: {
            attemptsLeft: 0,
            resetTime: errorData.resetTime,
            locked: true
          }
        };
      }

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to verify password');
      }

      const data = await response.json();
      
      // If login failed, check for rate limit information
      if (!data.valid) {
        // Store lockout time in localStorage if account is locked
        if (data.locked && data.resetTime) {
          localStorage.setItem(LOCKOUT_STORAGE_KEY, data.resetTime);
        }
        return {
          valid: false,
          rateLimitInfo: {
            attemptsLeft: data.attemptsLeft,
            resetTime: data.resetTime,
            locked: data.locked
          }
        };
      }
      
      return { valid: data.valid === true };
    } catch (error) {
      console.error('Error verifying password:', error);
      setError(error instanceof Error ? error.message : 'Unknown error occurred');
      return { valid: false };
    }
  };

  // Login function
  const login = async (password: string): Promise<boolean> => {
    setError(null);
    setRateLimitInfo(null);
    setIsLoading(true);

    try {
      // Check for local lockout before making API request
      const localLockout = checkLocalLockout();
      if (localLockout) {
        setRateLimitInfo(localLockout);
        setError('Too many failed attempts. Please try again later.');
        return false;
      }
      
      const result = await verifyPassword(password);

      if (result.valid) {
        // Save password to localStorage if valid
        localStorage.setItem(PASSWORD_STORAGE_KEY, password);
        setIsAuthenticated(true);
        return true;
      } else {
        // Handle rate limiting information if present
        if (result.rateLimitInfo) {
          setRateLimitInfo(result.rateLimitInfo);
          
          if (result.rateLimitInfo.locked) {
            setError('Too many failed attempts. Please try again later.');
          } else {
            const attemptsLeft = result.rateLimitInfo.attemptsLeft || 0;
            setError(`Invalid password. You have ${attemptsLeft} attempt${attemptsLeft !== 1 ? 's' : ''} remaining.`);
          }
        } else {
          setError('Invalid password');
        }
        return false;
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : 'An error occurred during login');
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  // Logout function
  const logout = () => {
    localStorage.removeItem(PASSWORD_STORAGE_KEY);
    setIsAuthenticated(false);
  };
  
  // Function to check if user is locked out based on localStorage
  const checkLocalLockout = (): RateLimitInfo | null => {
    const lockedUntil = localStorage.getItem(LOCKOUT_STORAGE_KEY);
    if (!lockedUntil) return null;
    
    const lockoutTime = new Date(lockedUntil);
    const now = new Date();
    
    // If lockout has expired, clear it
    if (now >= lockoutTime) {
      localStorage.removeItem(LOCKOUT_STORAGE_KEY);
      return null;
    }
    
    // Return active lockout info
    return {
      attemptsLeft: 0,
      resetTime: lockedUntil,
      locked: true
    };
  };

  // Check authentication status on component mount
  useEffect(() => {
    const checkAuth = async () => {
      setIsLoading(true);
      
      try {
        // First check if there's a lockout stored in localStorage
        const localLockout = checkLocalLockout();
        if (localLockout) {
          setRateLimitInfo(localLockout);
          setIsAuthenticated(false);
          // Don't try to authenticate if we're already locked out
          setIsLoading(false);
          return;
        }
        
        const storedPassword = localStorage.getItem(PASSWORD_STORAGE_KEY);
        
        if (!storedPassword) {
          setIsAuthenticated(false);
          return;
        }
        
        const result = await verifyPassword(storedPassword);
        
        if (result.valid) {
          setIsAuthenticated(true);
        } else {
          // If stored password is no longer valid, remove it
          localStorage.removeItem(PASSWORD_STORAGE_KEY);
          setIsAuthenticated(false);
          
          // If we got rate limited during background check, don't show error
          // as the user hasn't actively tried to log in
          if (result.rateLimitInfo?.locked) {
            setRateLimitInfo(result.rateLimitInfo);
            console.warn('IP is rate limited, clearing stored credentials');
          }
        }
      } catch (error) {
        console.error('Error checking authentication:', error);
        setError(error instanceof Error ? error.message : 'Unknown error occurred');
        setIsAuthenticated(false);
      } finally {
        setIsLoading(false);
      }
    };
    
    checkAuth();
  }, []);

  const value = {
    isAuthenticated,
    isLoading,
    error,
    rateLimitInfo,
    login,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

// Custom hook to use the auth context
export const useAuth = () => useContext(AuthContext);

export default AuthContext;
