# Cloudflare D1 Setup for Shopping List App

This document provides instructions for setting up and using Cloudflare D1 with this shopping list application.

## Prerequisites

- [Node.js](https://nodejs.org/)
- [Cloudflare account](https://dash.cloudflare.com/sign-up)
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/) (installed as a dev dependency)

## Setup Steps

### 1. Login to Cloudflare

Run the following command to log in to your Cloudflare account:

```bash
npx wrangler login
```

This will open a browser window where you can authorize Wrangler to access your Cloudflare account.

### 2. Create the D1 Database

Create a new D1 database by running:

```bash
npm run d1:create
```

This will output something like:

```
✅ Successfully created DB 'shopping_list_db' in region 'iad'
Created database 'shopping_list_db' (abc123def456...)
```

Take note of the database ID (the long string after the database name) - you'll need to update your `wrangler.toml` file with it.

### 3. Update wrangler.toml

Open `wrangler.toml` and replace the `database_id` placeholder with your actual database ID:

```toml
name = "shopping-list-app"
compatibility_date = "2023-12-01"

[[d1_databases]]
binding = "DB"
database_name = "shopping_list_db"
database_id = "YOUR_DATABASE_ID_HERE" # Replace with your actual database ID
```

### 4. Apply the Database Schema

Initialize your database schema by running:

```bash
npm run d1:migrate
```

This will create the necessary tables in your D1 database.

### 5. Run the Worker Locally

Start the local development server for your Cloudflare worker:

```bash
npm run dev:worker
```

This will start a local server, typically on http://127.0.0.1:8787, which can be used to test your API endpoints.

## API Endpoints

The API is designed using a Change Data Capture (CDC) pattern with minimal endpoints:

- `GET /api/changes` - Get all changes that occurred after a specific sequence number
  - Query parameter: `?after_sequence=123` to fetch only changes after sequence 123
  - Returns changes and the max sequence number in the response

- `POST /api/changes` - Insert new changes to the shopping list
  - Request body format: `{ "changes": [ {...}, {...}, ... ] }`
  - Each change needs `id`, `change` ("create" or "update"), `name`, `completed`, and optionally `deleted_at` fields
  - The endpoint automatically assigns a sequence number to each change

## Integration with Frontend

To integrate with your frontend using the CDC pattern:

1. Implement a sync strategy that:
   - Tracks the last sequence number processed by the client
   - Fetches only new changes from the server using `GET /api/changes?after_sequence=<last_sequence>`
   - Applies these changes to the local state in sequence order
   - Records local changes in memory or localStorage
   - Periodically sends accumulated local changes to the server via `POST /api/changes`

2. The current implementation still uses localStorage for persistence, so you can:
   - Continue using localStorage for offline capabilities 
   - Maintain two states: last known server state and local changes
   - Apply server changes on top of local state when syncing
   - Handle conflict resolution based on change timestamps if needed

3. When ready to switch to D1, add CDC sync logic to the ShoppingList.tsx component while maintaining the existing localStorage functionality for offline support.

4. Benefits of this CDC approach:
   - Efficient synchronization with minimal data transfer
   - Supports offline-first operation with proper syncing when online
   - Provides change history and audit capabilities
   - Better handles concurrent changes from multiple clients

## Deployment

To deploy your worker to Cloudflare:

```bash
npx wrangler deploy src/worker.ts
```

This will make your API available at your Cloudflare Workers domain.
