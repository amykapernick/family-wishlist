-- Numbers that texted in but aren't anyone's phone. They get one polite
-- refusal; later texts get no reply, so a wrong number isn't spammed (or
-- billed for) repeatedly.
CREATE TABLE sms_unknown_numbers (
  phone TEXT PRIMARY KEY,
  first_seen TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen TEXT NOT NULL DEFAULT (datetime('now')),
  texts INTEGER NOT NULL DEFAULT 1
);
