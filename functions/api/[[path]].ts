/**
 * API handler for Cloudflare Pages Functions
 * This handles all routes under /api/* and forwards them to the worker logic
 */
import type { D1Database } from '@cloudflare/workers-types';
import workerLogic from '../../src/worker';

// Define context type for Pages Functions
interface Context {
  request: Request;
  env: {
    DB: D1Database;
  };
}

// The handler function that processes all API requests
export const onRequest = async (context: Context) => {
  // Create a new request with the original URL to maintain path and query params
  const { request } = context;

  try {
    // Check if the database binding exists
    if (!context.env || !context.env.DB) {
      console.error('D1 Database binding is missing. Check your Cloudflare Pages configuration.');
      return new Response(
        JSON.stringify({
          error: 'Database configuration error',
          details: 'D1 Database binding is not configured correctly',
          env: JSON.stringify(Object.keys(context.env || {})),
          help: 'Add DB binding in Cloudflare Pages dashboard under Settings > Functions > D1 Database Bindings'
        }),
        { 
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        }
      );
    }
    
    // Pass the request to the worker logic defined in src/worker.ts
    return await workerLogic.fetch(request, context.env);
  } catch (error: unknown) {
    console.error('Error in API handler:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    return new Response(
      JSON.stringify({
        error: 'API processing error',
        message: errorMessage,
        path: new URL(request.url).pathname
      }),
      { 
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      }
    );
  }
};
