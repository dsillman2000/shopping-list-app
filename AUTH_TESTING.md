# Testing the Authentication System

## Local Testing Instructions

### 1. Set Up Local Development Environment

First, make sure your local development environment is properly set up:

```bash
# Install dependencies
npm install

# Set up D1 database locally (if not already created)
npm run d1:local:create

# Run migrations to create required tables
npm run d1:local:migrate

# Seed the password table with the default password
npm run d1:local:seed-password
```

### 2. Start the Local Development Server

```bash
# In one terminal, start the worker
npm run dev:local:worker

# In another terminal, start the front-end
npm run dev
```

### 3. Test Authentication Flow

1. Open your browser to `http://localhost:5173/`
2. You should be automatically redirected to the login page
3. Try entering an incorrect password - you should see an error message
4. Enter the correct password (default is "shopping123" unless you changed it)
5. You should be redirected to the shopping list
6. Refresh the page - you should still have access to the shopping list without re-entering the password

### 4. Test Authentication Persistence

1. With a successful login, open your browser's developer tools
2. Go to Application tab > Local Storage
3. Verify that the "shopping-list-password" key exists with your password
4. Manually delete this key
5. Refresh the page - you should be redirected back to the login page

### 5. Test Invalid Password Handling

1. In your Local Storage, manually change the "shopping-list-password" value to something that doesn't exist in the database
2. Refresh the page - you should be redirected back to the login page as the system detects the invalid password

## Production Deployment Testing

1. Deploy the application to Cloudflare Pages:
   ```bash
   npm run pages:deploy
   ```

2. Ensure the D1 database is properly configured in the Cloudflare dashboard

3. Run the password seed script for the production database:
   ```bash
   npm run d1:remote:seed-password
   ```

4. Visit your deployed Cloudflare Pages site and verify the authentication flow works similarly to the local testing

## Troubleshooting

If you encounter authentication issues:

1. Check browser console for errors
2. Ensure the D1 database is properly set up and the password table has at least one entry
3. Verify the API endpoint for password verification is working by testing it directly:
   ```bash
   curl -X POST -H "Content-Type: application/json" -d '{"password":"shopping123"}' http://localhost:8787/auth/verify
   ```
4. Clear browser localStorage and cookies, then try again
