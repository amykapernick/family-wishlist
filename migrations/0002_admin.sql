-- Admins manage people, links and app-wide security from /admin.
-- Admin rights only take effect while the person has a personal PIN.
ALTER TABLE people ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0 CHECK (is_admin IN (0, 1));

-- Small key/value store for app-wide settings.
--   session_epoch: bumped by "sign out every device"; family cookies carry
--   the epoch they were issued in and stop working when it changes.
CREATE TABLE app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT INTO app_settings (key, value) VALUES ('session_epoch', '1');
