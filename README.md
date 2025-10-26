# Shopping List App

A simple shopping list app built with React, shadcn/ui, TypeScript, and Tailwind CSS.

Designed to be deployed to Cloudflare Pages with a D1 SQL database for list persistence. The front-end was iteratively designed from a template by [dyad](https://dyad.sh/), with help from Claude to build more customized interactions and responsive features.

## Authentication System

The app includes a lightweight authentication system that protects the shopping list behind a password check.

### How It Works

1. When users first visit the app, they are redirected to the login page
2. The app checks for a stored password in localStorage under the key `shopping-list-password`
3. If no password exists in localStorage or the password is invalid, users stay on the login page
4. When a valid password is entered, it's stored in localStorage and the user is redirected to the shopping list
5. The authentication status persists across page reloads while the password remains valid

### Password Management

Passwords are stored in a D1 database table called `passwords`. To set up or change the password:

1. Edit `sql/seed_password.sql` with your desired password
2. Run the seed script:
   - For local development: `npm run d1:local:seed-password`
   - For production: `npm run d1:remote:seed-password`

### Security Considerations

This is a lightweight authentication system designed for simplicity rather than high security. Some limitations:

- Passwords are stored and transmitted as plain text
- There is no user account system - just a single shared password
- localStorage can be manually cleared or modified by users

For applications requiring stronger security, consider implementing a more robust authentication system.

### Rate Limiting

The app includes IP-based rate limiting to prevent brute force attacks:

- Users are limited to 5 incorrect password attempts per hour
- After 5 failed attempts, the IP is locked out for 1 hour
- Visual feedback shows remaining attempts and lockout status
- The system automatically cleans up old records to prevent database bloat
- Lockout status is stored in localStorage to minimize database queries

Rate limiting is implemented using two complementary approaches:

1. Server-side tracking via a `login_attempts` table in the D1 database:
   - IP addresses of login attempts
   - Number of failed attempts
   - First and last attempt timestamps
   - Lockout expiration time

2. Client-side tracking via localStorage:
   - Stores lockout status in 'shopping-list-locked-until' key
   - Prevents unnecessary API calls when already locked out
   - Reduces database load from repeated login attempts
