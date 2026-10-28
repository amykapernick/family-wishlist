-- Gifting is gone: claiming an item is the last step. Past gifts are now
-- everything that was claimed, dated by when it was claimed.
ALTER TABLE items RENAME COLUMN given_at TO claimed_at;
DROP INDEX items_owner_given;
CREATE INDEX items_owner_claimed ON items (owner_id, claimed_at);

-- Current claims get a date (best guess: when the item last changed).
UPDATE items SET claimed_at = updated_at WHERE claimed_by_id IS NOT NULL AND claimed_at IS NULL;

-- Items already given are finished, so they leave the list and stay in history.
UPDATE items SET status = 'archived' WHERE status = 'given';
-- The status CHECK still allows 'given' (SQLite can't change it without a
-- table rebuild), but nothing sets it any more. `occasion` is kept for old data.
