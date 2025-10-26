-- Drop tables if they exist
DROP TABLE IF EXISTS shopping_items;
DROP TABLE IF EXISTS shopping_items_cdc;
DROP TABLE IF EXISTS passwords;
DROP TABLE IF EXISTS login_attempts;

-- Create the shopping_items_cdc table for Change Data Capture
CREATE TABLE shopping_items_cdc (
  sequence_number INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL,
  change TEXT NOT NULL CHECK (change IN ('create', 'update')),
  name TEXT NOT NULL,
  completed BOOLEAN NOT NULL DEFAULT 0,
  deleted_at TEXT,
  timestamp TEXT DEFAULT (datetime('now'))
);

-- Create index on id for faster lookups
CREATE INDEX idx_shopping_items_cdc_id ON shopping_items_cdc(id);

-- Create the passwords table
CREATE TABLE IF NOT EXISTS passwords (
  password TEXT NOT NULL
);

-- Create the login_attempts table for rate limiting
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
