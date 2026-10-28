-- Each group has its own link (/join/group/<token>). Like the family link it
-- skips the family PIN, but that device only offers the group's people on
-- "Who are you?". Admins can replace a token to stop an old link working.
ALTER TABLE family_groups ADD COLUMN token TEXT;
UPDATE family_groups SET token = lower(hex(randomblob(16)));
CREATE UNIQUE INDEX family_groups_token ON family_groups (token);
