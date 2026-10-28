-- Evergreen items (shampoo, chocolates...) stay on the list after they're
-- claimed. Each claim is recorded in item_claims instead of on the item, so
-- several people can claim one over time and we can see how often it's given.
ALTER TABLE items ADD COLUMN evergreen INTEGER NOT NULL DEFAULT 0 CHECK (evergreen IN (0, 1));

CREATE TABLE item_claims (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL REFERENCES items(id),
  claimed_by_id TEXT NOT NULL REFERENCES people(id),  -- who the gift is from
  entered_by_id TEXT NOT NULL REFERENCES people(id),  -- who clicked claim
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX item_claims_item ON item_claims (item_id, created_at);
