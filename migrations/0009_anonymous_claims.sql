-- Removing a family member keeps their claims (so nothing gets bought twice
-- and Past gifts stays complete), just without their name. Evergreen claims
-- therefore need nullable people; SQLite needs a table rebuild for that.
CREATE TABLE item_claims_new (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL REFERENCES items(id),
  claimed_by_id TEXT REFERENCES people(id),  -- who the gift is from (null: since removed)
  entered_by_id TEXT REFERENCES people(id),  -- who clicked claim (null: since removed)
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO item_claims_new (id, item_id, claimed_by_id, entered_by_id, created_at)
  SELECT id, item_id, claimed_by_id, entered_by_id, created_at FROM item_claims;

DROP TABLE item_claims;
ALTER TABLE item_claims_new RENAME TO item_claims;

CREATE INDEX item_claims_item ON item_claims (item_id, created_at);
