-- Groups split the family into sections: people only see others who share a
-- group with them (someone in no group sees only themselves). "groups" is an
-- SQLite keyword, hence family_groups.
CREATE TABLE family_groups (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE person_groups (
  person_id TEXT NOT NULL REFERENCES people(id),
  group_id TEXT NOT NULL REFERENCES family_groups(id),
  PRIMARY KEY (person_id, group_id)
);

CREATE INDEX person_groups_group ON person_groups (group_id);

-- Everyone starts in one group, so nothing changes until an admin splits it up.
INSERT INTO family_groups (id, name) VALUES ('family', 'Family');
INSERT INTO person_groups (person_id, group_id) SELECT id, 'family' FROM people;
