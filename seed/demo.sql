-- Demo family for LOCAL DEVELOPMENT ONLY. Never run against production.
--   npm run db:seed:local
-- Alex is the admin (personal PIN 1357). Sam has the personal PIN 2468.
-- Everyone else has no PIN.

DELETE FROM idea_requests;
DELETE FROM item_claims;
DELETE FROM items;
DELETE FROM can_act_for;
DELETE FROM contacts;
DELETE FROM auth_attempts;
DELETE FROM sms_unknown_numbers;
DELETE FROM sms_contexts;
DELETE FROM sizes;
DELETE FROM people;

INSERT INTO people (id, name, kind, phone, pin_hash, is_admin) VALUES
  ('p-alex', 'Alex',  'adult', '+61400000001', 'pbkdf2$100000$2o951X2_H65Cowbx2BECow$TgaKEiSFJDpQBb_JkhLwLJPaiwQS8EjfLMo8WKvAJ2E', 1),
  ('p-sam',  'Sam',   'adult', '+61400000002', 'pbkdf2$100000$SzdfvZosY9Ub1yjpqIJEtg$VXhT219sdmANXkJcaaKaEwnJJjTqKB3w-DSJf6OrA5c', 0),
  ('p-mia',  'Mia',   'child', NULL, NULL, 0),
  ('p-leo',  'Leo',   'child', NULL, NULL, 0),
  ('p-june', 'Grandma June', 'adult', NULL, NULL, 0);

-- Recommenders: who is asked for gift ideas about each person (stored in
-- contacts). Sam and Leo have none, so requests about them go to them.
INSERT INTO contacts (person_id, contact_id) VALUES
  ('p-mia', 'p-sam'), ('p-mia', 'p-june'),
  ('p-alex', 'p-sam'),
  ('p-june', 'p-alex');

-- Claimed items stay on the list until the owner removes them (archived);
-- both appear in Past gifts.
INSERT INTO items (id, owner_id, title, url, notes, status, claimed_by_id, entered_by_id, claimed_at, created_by_id, created_at) VALUES
  ('i-1', 'p-alex', 'Pour-over coffee kettle', 'https://example.com/kettle', 'Gooseneck, any colour', 'wanted', NULL, NULL, NULL, 'p-alex', datetime('now', '-20 days')),
  ('i-2', 'p-alex', 'Hiking socks', NULL, 'Size L, merino', 'claimed', 'p-june', 'p-sam', datetime('now', '-12 days'), 'p-alex', datetime('now', '-19 days')),
  ('i-3', 'p-alex', 'Cookbook: Salt Fat Acid Heat', NULL, NULL, 'archived', 'p-sam', 'p-sam', datetime('now', '-3 months'), 'p-alex', datetime('now', '-6 months')),
  ('i-4', 'p-sam', 'Noise-cancelling headphones', NULL, 'Over-ear please', 'wanted', NULL, NULL, NULL, 'p-sam', datetime('now', '-15 days')),
  ('i-5', 'p-sam', 'Gardening gloves', NULL, NULL, 'claimed', 'p-alex', 'p-alex', datetime('now', '-6 days'), 'p-sam', datetime('now', '-14 days')),
  ('i-6', 'p-mia', 'LEGO Botanical set', NULL, 'The orchid one', 'wanted', NULL, NULL, NULL, 'p-alex', datetime('now', '-10 days')),
  ('i-7', 'p-mia', 'Art supplies', NULL, 'Watercolour pencils', 'claimed', 'p-june', 'p-alex', datetime('now', '-5 days'), 'p-sam', datetime('now', '-9 days')),
  ('i-8', 'p-mia', 'Scooter', NULL, NULL, 'archived', 'p-alex', 'p-alex', datetime('now', '-10 months'), 'p-sam', datetime('now', '-11 months')),
  ('i-9', 'p-mia', 'Bike helmet', NULL, NULL, 'archived', 'p-june', 'p-alex', datetime('now', '-20 months'), 'p-alex', datetime('now', '-21 months')),
  ('i-10', 'p-leo', 'Dinosaur book', NULL, 'He loves the T-rex', 'wanted', NULL, NULL, NULL, 'p-sam', datetime('now', '-5 days')),
  ('i-11', 'p-leo', 'Bath toys', NULL, NULL, 'wanted', NULL, NULL, NULL, 'p-alex', datetime('now', '-4 days')),
  ('i-12', 'p-june', 'Large-print crossword book', NULL, NULL, 'wanted', NULL, NULL, NULL, 'p-alex', datetime('now', '-8 days')),
  ('i-13', 'p-june', 'Photo frame for the grandkids', NULL, 'Wooden, 5x7', 'wanted', NULL, NULL, NULL, 'p-alex', datetime('now', '-7 days')),
  ('i-14', 'p-mia', 'New exercise shorts', NULL, 'Size 10', 'wanted', NULL, NULL, NULL, 'p-sam', datetime('now', '-3 days')),
  ('i-15', 'p-mia', 'Denim shorts', NULL, NULL, 'wanted', NULL, NULL, NULL, 'p-sam', datetime('now', '-2 days'));

-- Evergreen items stay on the list; each claim is kept in item_claims.
INSERT INTO items (id, owner_id, title, notes, evergreen, created_by_id, created_at) VALUES
  ('i-16', 'p-sam', 'Fancy shampoo', 'The Aesop one', 1, 'p-sam', datetime('now', '-300 days')),
  ('i-17', 'p-june', 'Dark chocolate', '70% or darker', 1, 'p-alex', datetime('now', '-300 days')),
  ('i-18', 'p-alex', 'Nice moisturiser', NULL, 1, 'p-alex', datetime('now', '-200 days'));

INSERT INTO item_claims (id, item_id, claimed_by_id, entered_by_id, created_at) VALUES
  ('c-1', 'i-16', 'p-alex', 'p-alex', datetime('now', '-2 months')),
  ('c-2', 'i-16', 'p-june', 'p-alex', datetime('now', '-4 months')),
  ('c-3', 'i-16', 'p-alex', 'p-alex', datetime('now', '-9 months')),
  ('c-4', 'i-17', 'p-sam', 'p-sam', datetime('now', '-1 month'));

INSERT INTO idea_requests (id, from_id, about_id, asked_id, status, response, created_at) VALUES
  ('r-1', 'p-june', 'p-alex', 'p-sam', 'answered', 'Alex has been eyeing a new rain jacket. Navy, size M.', datetime('now', '-6 days')),
  ('r-2', 'p-june', 'p-sam', 'p-alex', 'open', NULL, datetime('now', '-2 days'));

-- Sizes (shown to everyone, changed by the person or whoever acts for them).
INSERT INTO sizes (id, person_id, item, size, updated_at) VALUES
  ('s-1', 'p-mia', 'Shoes', 'AU kids 13', datetime('now', '-20 days')),
  ('s-2', 'p-mia', 'Clothes', '8', datetime('now', '-20 days')),
  ('s-3', 'p-mia', 'Hat', 'S (52cm)', datetime('now', '-14 months')),
  ('s-4', 'p-alex', 'Shoes', 'AU 9', datetime('now', '-3 months')),
  ('s-5', 'p-alex', 'T-shirt', 'M', datetime('now', '-3 months')),
  ('s-6', 'p-june', 'Gloves', 'Small', datetime('now', '-1 month'));
