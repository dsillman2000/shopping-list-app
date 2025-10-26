/**
 * Shopping List API using Cloudflare Workers + D1
 * 
 * This file contains the API endpoints for the shopping list app.
 * The frontend can use these endpoints to interact with the D1 database.
 */
import type { D1Database } from '@cloudflare/workers-types';

export interface Env {
  DB: D1Database;
}

export interface ShoppingItem {
  id: string;
  name: string;
  completed: boolean;
  deleted_at: string | null;
}

export interface ShoppingItemCDC extends ShoppingItem {
  sequence_number?: number;
  change: 'create' | 'update';
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    
    // Handle OPTIONS for CORS
    if (request.method === 'OPTIONS') {
      return handleCORS(request);
    }
    
    // API routes for CDC operations - support both /api/changes and /changes paths
    if (path === '/api/changes' || path === '/changes') {
      // Get changes after a certain sequence number
      if (request.method === 'GET') {
        const seqNumStr = url.searchParams.get('after_sequence');
        const afterSequence = seqNumStr ? parseInt(seqNumStr, 10) : 0;
        return await getChanges(env, afterSequence, request);
      } 
      // Insert new changes
      else if (request.method === 'POST') {
        return await insertChanges(request, env);
      }
    }

    // Authentication endpoint
    if (path === '/api/auth/verify' || path === '/auth/verify') {
      if (request.method === 'POST') {
        return await verifyPassword(request, env);
      }
    }
    
    // Default response for unmatched routes
    return new Response('Not Found', { status: 404 });
  },
};

// CORS headers helper
function handleCORS(request?: Request): Response {
  // Get the Origin header from the request if it exists
  const origin = request?.headers.get('Origin') || '*';
  
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': origin, // Use the actual origin or * as fallback
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
      'Access-Control-Allow-Credentials': 'true', // Allow credentials
    },
  });
}

/**
 * Get changes that occurred after a specific sequence number
 * @param env - Environment with D1 database
 * @param afterSequence - Only return changes after this sequence number
 * @param request - Original request for CORS headers
 */
async function getChanges(env: Env, afterSequence: number = 0, request?: Request): Promise<Response> {
  try {
    // Query changes that happened after the given sequence number
    const statement = env.DB.prepare(`
      SELECT * FROM shopping_items_cdc 
      WHERE sequence_number > ?
      ORDER BY sequence_number ASC
    `).bind(afterSequence);
    
    const { results } = await statement.all();
    
    // If there are results, return the highest sequence number to help the client track progress
    let maxSequence = afterSequence;
    if (results && results.length > 0) {
      maxSequence = results[results.length - 1].sequence_number as number;
    }
    
    return corsResponse({
      changes: results,
      max_sequence: maxSequence
    }, 200, request);
  } catch (error) {
    console.error('Error getting changes:', error);
    return corsResponse({ error: 'Failed to fetch changes', details: String(error) }, 500, request);
  }
}

/**
 * Insert new changes to the shopping items
 * @param request - HTTP request with changes data
 * @param env - Environment with D1 database
 */
async function insertChanges(request: Request, env: Env): Promise<Response> {
  try {
    // Parse the request body
    const payload = await request.json() as {
      changes: Array<{
        id: string;
        change: 'create' | 'update';
        name: string;
        completed: boolean;
        deleted_at: string | null;
      }>
    };
    
    if (!payload.changes || !Array.isArray(payload.changes)) {
      return corsResponse({ error: 'Invalid request format' }, 400);
    }
    
    const batch = [];
    let lastSequenceNumber = 0;
    
    for (const change of payload.changes) {
      // Validate each change
      if (!change.id || !change.change || typeof change.name !== 'string') {
        return corsResponse({ error: 'Invalid change format' }, 400);
      }
      
      // Insert the change into the CDC table
      batch.push(
        env.DB.prepare(
          `INSERT INTO shopping_items_cdc 
           (id, change, name, completed, deleted_at) 
           VALUES (?, ?, ?, ?, ?)`
        ).bind(
          change.id,
          change.change,
          change.name,
          change.completed ? 1 : 0,
          change.deleted_at
        )
      );
    }
    
    // Execute all statements in batch
    if (batch.length > 0) {
      await env.DB.batch(batch);
      
      // Get the last inserted sequence number
      const { results } = await env.DB.prepare(
        'SELECT MAX(sequence_number) as max_seq FROM shopping_items_cdc'
      ).all();
      
      if (results && results.length > 0 && results[0].max_seq) {
        lastSequenceNumber = results[0].max_seq as number;
      }
    }
    
    return corsResponse({ 
      message: 'Changes recorded successfully',
      sequence_number: lastSequenceNumber 
    }, 200, request);
  } catch (error) {
    console.error('Error inserting changes:', error);
    return corsResponse({ error: 'Failed to record changes', details: String(error) }, 500, request);
  }
}

// Helper to add CORS headers to all responses
function corsResponse(body: any, status = 200, request?: Request): Response {
  // Get the Origin header from the request if available
  const origin = request?.headers.get('Origin') || '*';
  
  const headers = {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Credentials': 'true',
    'Content-Type': 'application/json',
  };
  
  return new Response(JSON.stringify(body), { status, headers });
}

/**
 * Get the client IP address from the request
 * @param request - HTTP request
 */
function getClientIp(request: Request): string {
  // Try to get IP from CF-Connecting-IP header (Cloudflare)
  const cfIp = request.headers.get('CF-Connecting-IP');
  if (cfIp) return cfIp;
  
  // Try to get IP from X-Forwarded-For header
  const forwardedFor = request.headers.get('X-Forwarded-For');
  if (forwardedFor) {
    // X-Forwarded-For can contain multiple IPs, take the first one
    return forwardedFor.split(',')[0].trim();
  }
  
  // Fallback to a default IP if we can't determine the real one
  // This is not ideal, but it's better than having no rate limiting
  return '0.0.0.0';
}

/**
 * Check if an IP is rate limited
 * @param env - Environment with D1 database
 * @param ipAddress - Client IP address
 */
async function checkRateLimit(env: Env, ipAddress: string): Promise<{ limited: boolean; attemptsLeft: number; resetTime: string | null }> {
  const MAX_ATTEMPTS = 5;
  const RATE_LIMIT_WINDOW = 60 * 60; // 1 hour in seconds
  
  try {
    // First, clean up old attempts (older than 1 hour)
    await env.DB.prepare(`
      DELETE FROM login_attempts 
      WHERE datetime(last_attempt_time, '+1 hour') < datetime('now')
      AND locked_until IS NULL
    `).run();
    
    // Check if this IP is already in the database
    const ipCheck = await env.DB.prepare(`
      SELECT 
        attempt_count, 
        first_attempt_time, 
        last_attempt_time, 
        locked_until 
      FROM login_attempts 
      WHERE ip_address = ?
    `).bind(ipAddress).first();
    
    if (!ipCheck) {
      // No previous attempts, not rate limited
      return { limited: false, attemptsLeft: MAX_ATTEMPTS, resetTime: null };
    }
    
    // Check if the IP is currently locked out
    if (ipCheck.locked_until) {
      const lockedUntil = new Date(ipCheck.locked_until as string);
      const now = new Date();
      
      if (now < lockedUntil) {
        // Still locked out
        const resetTimeStr = lockedUntil.toISOString();
        return { limited: true, attemptsLeft: 0, resetTime: resetTimeStr };
      } else {
        // Lock period expired, reset attempts
        await env.DB.prepare(`
          DELETE FROM login_attempts WHERE ip_address = ?
        `).bind(ipAddress).run();
        return { limited: false, attemptsLeft: MAX_ATTEMPTS, resetTime: null };
      }
    }
    
    // Calculate attempts left
    const attemptsLeft = Math.max(0, MAX_ATTEMPTS - (ipCheck.attempt_count as number));
    
    // Not locked and still has attempts left
    return { 
      limited: attemptsLeft <= 0, 
      attemptsLeft, 
      resetTime: null 
    };
  } catch (error) {
    console.error('Error checking rate limit:', error);
    // Fail open - better to allow login than block everyone if the rate limit check fails
    return { limited: false, attemptsLeft: MAX_ATTEMPTS, resetTime: null };
  }
}

/**
 * Record a failed login attempt
 * @param env - Environment with D1 database
 * @param ipAddress - Client IP address
 */
async function recordFailedAttempt(env: Env, ipAddress: string): Promise<string | null> {
  const MAX_ATTEMPTS = 5;
  const LOCKOUT_DURATION = 1 * 60; // 1 hour in seconds
  
  try {
    // Check if this IP already has attempts recorded
    const existingRecord = await env.DB.prepare(`
      SELECT attempt_count FROM login_attempts WHERE ip_address = ?
    `).bind(ipAddress).first();
    
    if (existingRecord) {
      // Increment existing record
      const newCount = (existingRecord.attempt_count as number) + 1;
      
      // If this exceeds the max attempts, lock the account
      if (newCount >= MAX_ATTEMPTS) {
        const lockUntil = new Date(Date.now() + LOCKOUT_DURATION * 1000).toISOString();
        
        await env.DB.prepare(`
          UPDATE login_attempts 
          SET attempt_count = ?, 
              last_attempt_time = datetime('now'),
              locked_until = ?
          WHERE ip_address = ?
        `).bind(newCount, lockUntil, ipAddress).run();
        
        return lockUntil;
      } else {
        // Just increment the counter
        await env.DB.prepare(`
          UPDATE login_attempts 
          SET attempt_count = ?, 
              last_attempt_time = datetime('now')
          WHERE ip_address = ?
        `).bind(newCount, ipAddress).run();
      }
    } else {
      // Create new record with attempt_count = 1
      await env.DB.prepare(`
        INSERT INTO login_attempts (ip_address) 
        VALUES (?)
      `).bind(ipAddress).run();
    }
    
    return null; // No lockout applied
  } catch (error) {
    console.error('Error recording failed attempt:', error);
    return null; // Fail open
  }
}

/**
 * Reset failed login attempts on successful login
 * @param env - Environment with D1 database
 * @param ipAddress - Client IP address
 */
async function resetFailedAttempts(env: Env, ipAddress: string): Promise<void> {
  try {
    await env.DB.prepare(`
      DELETE FROM login_attempts WHERE ip_address = ?
    `).bind(ipAddress).run();
  } catch (error) {
    console.error('Error resetting failed attempts:', error);
    // No need to handle - this is just cleanup
  }
}

/**
 * Verify if a password exists in the passwords table with rate limiting
 * @param request - HTTP request with password data
 * @param env - Environment with D1 database
 */
async function verifyPassword(request: Request, env: Env): Promise<Response> {
  try {
    const ipAddress = getClientIp(request);
    
    // Check if this IP is rate limited
    const rateLimitCheck = await checkRateLimit(env, ipAddress);
    
    if (rateLimitCheck.limited) {
      return corsResponse({ 
        error: 'Too many failed attempts', 
        resetTime: rateLimitCheck.resetTime,
        retryAfter: rateLimitCheck.resetTime
      }, 429, request);
    }
    
    // Parse the request body
    const payload = await request.json() as {
      password: string;
    };
    
    if (!payload.password) {
      return corsResponse({ 
        error: 'Password is required',
        attemptsLeft: rateLimitCheck.attemptsLeft 
      }, 400, request);
    }
    
    // Check if the password exists in the database
    const statement = env.DB.prepare(`
      SELECT COUNT(*) as count FROM passwords 
      WHERE password = ?
    `).bind(payload.password);
    
    const { results } = await statement.all();
    
    if (!results || results.length === 0) {
      return corsResponse({ error: 'Database error' }, 500, request);
    }
    
    const count = results[0].count as number;
    const isValid = count > 0;
    
    if (isValid) {
      // Successful login - reset failed attempts
      await resetFailedAttempts(env, ipAddress);
      
      return corsResponse({
        valid: true
      }, 200, request);
    } else {
      // Failed login - record the attempt
      const lockUntil = await recordFailedAttempt(env, ipAddress);
      const updatedCheck = await checkRateLimit(env, ipAddress);
      
      return corsResponse({
        valid: false,
        attemptsLeft: updatedCheck.attemptsLeft,
        locked: !!lockUntil,
        resetTime: lockUntil
      }, 200, request);
    }
  } catch (error) {
    console.error('Error verifying password:', error);
    return corsResponse({ error: 'Failed to verify password', details: String(error) }, 500, request);
  }
}
