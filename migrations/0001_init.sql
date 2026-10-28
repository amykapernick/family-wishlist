-- Family Wishlist: initial schema (see SPEC.md "Data model")

CREATE TABLE people (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('adult','child')),
  phone TEXT UNIQUE,              -- E.164, optional
  pin_hash TEXT,                  -- optional personal PIN required to act as this person
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE contacts (          -- "linked people" you can ask for ideas
  person_id TEXT NOT NULL REFERENCES people(id),
  contact_id TEXT NOT NULL REFERENCES people(id),
  relation TEXT,                  -- partner, parent, etc.
  PRIMARY KEY (person_id, contact_id),
  CHECK (person_id <> contact_id)
);

CREATE TABLE can_act_for (       -- who may act as whom (in addition to self)
  person_id TEXT NOT NULL REFERENCES people(id),
  acts_for_id TEXT NOT NULL REFERENCES people(id),
  PRIMARY KEY (person_id, acts_for_id),
  CHECK (person_id <> acts_for_id)
);

CREATE TABLE items (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES people(id),   -- whose wishlist
  title TEXT NOT NULL,
  url TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'wanted'
    CHECK (status IN ('wanted','claimed','given','archived')),
  claimed_by_id TEXT REFERENCES people(id),        -- who the gift is FROM
  entered_by_id TEXT REFERENCES people(id),        -- who actually clicked
  occasion TEXT,                                   -- e.g. 'Christmas 2026'
  given_at TEXT,
  created_by_id TEXT REFERENCES people(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX items_owner_status ON items (owner_id, status);
CREATE INDEX items_owner_given ON items (owner_id, given_at);

CREATE TABLE idea_requests (     -- "ask X for ideas about Y"
  id TEXT PRIMARY KEY,
  from_id TEXT NOT NULL REFERENCES people(id),
  about_id TEXT NOT NULL REFERENCES people(id),
  asked_id TEXT NOT NULL REFERENCES people(id),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','answered','closed')),
  response TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (asked_id <> about_id)
);

CREATE INDEX idea_requests_asked ON idea_requests (asked_id, status);
CREATE INDEX idea_requests_about ON idea_requests (about_id);

CREATE TABLE auth_attempts (     -- simple PIN brute-force throttle
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL DEFAULT 0,
  window_start TEXT NOT NULL
);
