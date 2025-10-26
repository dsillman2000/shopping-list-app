-- Drop tables if they exist
DROP TABLE IF EXISTS shopping_items;
DROP TABLE IF EXISTS shopping_items_cdc;
DROP TABLE IF EXISTS passwords;

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

-- Create the passwords table (may or may not be used)
CREATE TABLE IF NOT EXISTS passwords (
  password TEXT NOT NULL
);
