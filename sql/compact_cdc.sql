-- Compaction Script for shopping_items_cdc
-- This script reduces the size of the CDC log by keeping only the latest state for each item
-- and inserting a 'compact' record to signal clients to reset their local storage.

-- Wrap in a transaction to ensure atomicity
BEGIN TRANSACTION;

-- 1. Create a temporary table to store the latest state of all non-deleted items
-- We exclude 'compaction-signal' to prevent it from being re-inserted as a 'create' record.
CREATE TEMP TABLE latest_states AS
SELECT id, 'create' as change, name, completed, deleted_at, updated_at, timestamp
FROM shopping_items_cdc
WHERE sequence_number IN (
    SELECT MAX(sequence_number)
    FROM shopping_items_cdc
    GROUP BY id
) 
AND deleted_at IS NULL
AND id != 'compaction-signal';

-- 2. Delete all existing records from the CDC table
DELETE FROM shopping_items_cdc;

-- 3. Insert the 'compact' signal record
-- This record tells clients: "Everything before this point is gone. Clear your local DB."
INSERT INTO shopping_items_cdc (id, change, name, completed, updated_at)
VALUES ('compaction-signal', 'compact', 'Compaction Signal', 0, datetime('now'));

-- 4. Re-insert the latest states
-- These will have sequence numbers higher than the 'compact' record
INSERT INTO shopping_items_cdc (id, change, name, completed, deleted_at, updated_at, timestamp)
SELECT id, change, name, completed, deleted_at, updated_at, timestamp
FROM latest_states;

-- 5. Cleanup
DROP TABLE latest_states;

COMMIT;
