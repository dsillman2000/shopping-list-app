-- Compaction Script for shopping_items_cdc
-- This script reduces the size of the CDC log by keeping only the latest state for each item
-- and inserting a 'compact' record to signal clients to reset their local storage.

-- 1. Identify the latest states and the compaction signal in one flow.
-- We use a CTE to capture the snapshot before we start deleting.
-- Note: D1 execute runs the whole file; we can't easily use a CTE across multiple 
-- top-level statements if they are separated by semicolons in a way that breaks session.

-- Refactored approach: 
-- A) Insert the signal.
-- B) Insert the snapshots based on the state BEFORE the signal.
-- C) Delete everything older than the signal.

INSERT INTO shopping_items_cdc (id, change, name, completed, updated_at)
VALUES ('compaction-signal', 'compact', 'Compaction Signal', 0, datetime('now'));

INSERT INTO shopping_items_cdc (id, change, name, completed, deleted_at, updated_at, timestamp)
SELECT id, 'create', name, completed, deleted_at, updated_at, timestamp
FROM shopping_items_cdc
WHERE sequence_number IN (
    SELECT MAX(sequence_number)
    FROM shopping_items_cdc
    WHERE id != 'compaction-signal'
    GROUP BY id
) 
AND deleted_at IS NULL
-- Ensure we don't pick up the signal we just inserted as a 'create' record
AND change != 'compact';

DELETE FROM shopping_items_cdc
WHERE sequence_number < (
    SELECT MAX(sequence_number)
    FROM shopping_items_cdc
    WHERE id = 'compaction-signal'
);
