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
