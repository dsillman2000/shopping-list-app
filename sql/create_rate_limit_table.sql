-- Create rate limiting table for tracking login attempts
CREATE TABLE IF NOT EXISTS login_attempts (
  ip_address TEXT NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 1,
  first_attempt_time TEXT NOT NULL DEFAULT (datetime('now')),
  last_attempt_time TEXT NOT NULL DEFAULT (datetime('now')),
  locked_until TEXT,
  PRIMARY KEY (ip_address)
);

-- Create index for faster lookups by IP
CREATE INDEX IF NOT EXISTS idx_login_attempts_ip ON login_attempts(ip_address);

-- Create cleanup procedure (SQLite doesn't support automatic cleanup, so we'll handle this in our code)
-- We will delete entries older than 1 hour during our rate limit checks
