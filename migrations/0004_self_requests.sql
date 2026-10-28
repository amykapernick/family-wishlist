-- Asking for ideas about someone with no recommenders asks that person
-- themselves, so allow asked_id = about_id. SQLite can't drop a CHECK, so
-- the table is rebuilt (nothing references it).
CREATE TABLE idea_requests_new (
  id TEXT PRIMARY KEY,
  from_id TEXT NOT NULL REFERENCES people(id),
  about_id TEXT NOT NULL REFERENCES people(id),
  asked_id TEXT NOT NULL REFERENCES people(id),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','answered','closed')),
  response TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (asked_id <> from_id)
);

INSERT INTO idea_requests_new (id, from_id, about_id, asked_id, status, response, created_at)
  SELECT id, from_id, about_id, asked_id, status, response, created_at FROM idea_requests;

DROP TABLE idea_requests;
ALTER TABLE idea_requests_new RENAME TO idea_requests;

CREATE INDEX idea_requests_asked ON idea_requests (asked_id, status);
CREATE INDEX idea_requests_about ON idea_requests (about_id);
