-- The last numbered list texted to each phone, so "claim 2" or
-- "claim shorts" knows which list it means. Short-lived: entries older than
-- 30 minutes are ignored and cleared out as new ones are saved.
CREATE TABLE sms_contexts (
  phone TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES people(id),
  item_ids TEXT NOT NULL,          -- JSON array, in list order
  sent_at INTEGER NOT NULL         -- ms since epoch
);
