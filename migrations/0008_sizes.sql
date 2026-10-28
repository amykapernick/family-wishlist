-- Each person's sizes, as free-text pairs ("Shoes" -> "AU 9"), each with
-- when it was last changed so stale sizes (growing kids) are easy to spot.
CREATE TABLE sizes (
  id TEXT PRIMARY KEY,
  person_id TEXT NOT NULL REFERENCES people(id),
  item TEXT NOT NULL,
  size TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX sizes_person_item ON sizes (person_id, item COLLATE NOCASE);
