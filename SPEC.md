# Family Wishlist: Build Spec

A small, free-tier, link-and-PIN protected web app for a family to manage present wishlists. Phase 1 is the web app. Phase 2 adds SMS via Twilio.

## Goals

- Each person has a wishlist. Anyone can view others' lists, claim items, and check them off as given.
- No per-user logins. A family link plus PIN gets you in, then you pick who you are acting as.
- Surprises are protected: a person never sees claims or gift history on their own list.
- Gift history is kept for at least a year (never hard-deleted) so we know what each person has received.
- People without phones (kids, grandparents) are first-class: lists can be edited and claimed on their behalf.

## Stack (all free tier)

- **SvelteKit** with `@sveltejs/adapter-cloudflare`, deployed to Cloudflare Workers (static assets + server routes in one project).
- **Cloudflare D1** (SQLite) for data. SQL migrations in `/migrations`, applied with `wrangler d1 migrations apply`.
- TypeScript throughout. Plain SQL via D1 prepared statements (no heavy ORM).
- Secrets via `wrangler secret` (never committed). Local dev with `wrangler dev` and a local D1.
- No external services in phase 1.

## Data model (D1 / SQLite)

```sql
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
  PRIMARY KEY (person_id, contact_id)
);

CREATE TABLE can_act_for (       -- who may act as whom (in addition to self)
  person_id TEXT NOT NULL REFERENCES people(id),
  acts_for_id TEXT NOT NULL REFERENCES people(id),
  PRIMARY KEY (person_id, acts_for_id)
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

CREATE TABLE idea_requests (     -- "ask X for ideas about Y"
  id TEXT PRIMARY KEY,
  from_id TEXT NOT NULL REFERENCES people(id),
  about_id TEXT NOT NULL REFERENCES people(id),
  asked_id TEXT NOT NULL REFERENCES people(id),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','answered','closed')),
  response TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE auth_attempts (     -- simple PIN brute-force throttle
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL DEFAULT 0,
  window_start TEXT NOT NULL
);
```

## Auth model

1. **Family link:** `/join/<FAMILY_TOKEN>` validates the token (stored as a secret) and sets a signed, HttpOnly, Secure, long-lived cookie (about 1 year). The token is never shown in the app after that.
2. **Family PIN:** if the cookie is missing or expired, show a PIN prompt (secret `FAMILY_PIN_HASH`). Throttle attempts via `auth_attempts` (for example 5 attempts per 15 minutes per IP).
3. **Acting as:** an "Acting as" switcher in the header, remembered in a cookie. The options are the current person's own identity plus anyone in `can_act_for`. If the target has a `pin_hash`, require that PIN before switching (verify server-side, then remember for the session).
4. All server routes check the family cookie. Every write checks that the "acting as" identity is permitted. Never trust the client for identity.
5. Hash PINs with PBKDF2 or scrypt (WebCrypto), with per-record salt. Sign cookies with an HMAC secret `COOKIE_SECRET`.

## Spoiler rules (enforce server-side, not just in the UI)

- When viewing **your own** list (the acting-as person is the owner): hide `claimed_by_id`, `status = claimed/given`, and the Past Gifts view. Show only the items and notes. An item claimed by someone else just appears as "wanted".
- When viewing **someone else's** list: show claim status, who claimed it, and gift history.
- API responses must strip these fields for owner views, not merely hide them in the UI.
- Items a person adds for their own list can be edited or removed by them. Claimed or given items are not deletable (archive only).

## Pages / routes

- `/` Home: grid of people with their wanted-item counts. Header has the Acting-as switcher.
- `/people/[id]` Wishlist for a person: add or edit item (title, URL, notes), claim and unclaim, mark given (occasion and date).
- `/people/[id]/history` Past gifts: given items with who gave, the occasion and date. Hidden when the viewer is the owner.
- `/people/[id]/ask` Request ideas: choose a linked contact to ask about this person. Show open requests and responses.
- `/requests` Inbox for requests addressed to the acting-as person, with a reply form.
- `/settings` Manage people, contacts, and can-act-for links, and set personal PINs.
- `/join/[token]` and `/pin` Entry points described above.

## Behaviour details

- **Claiming:** sets `status='claimed'`, `claimed_by_id` (the giver, selectable from people, defaulting to acting-as), and `entered_by_id` (the actual acting-as identity). A grandparent can therefore be the giver even if someone else entered it.
- **Mark given:** sets `status='given'`, `occasion`, and `given_at`.
- **Retention:** no hard deletes of claimed or given items. Archive instead. Past Gifts defaults to showing the last 12 months with an option to show all.
- **Concurrency:** claiming an item that is already claimed should fail gracefully with a clear message (check status in the `UPDATE ... WHERE status='wanted'`).
- **Ideas requests (phase 1):** in-app only. Phase 2 also notifies via SMS.

## Accessibility and UI

- Semantic HTML, WCAG 2.2 AA minimum, full keyboard operation, visible focus styles.
- Forms use real labels and clear error messages. Status changes announced via live regions.
- Responsive, mobile-first, large tap targets. Respect `prefers-reduced-motion` and `prefers-color-scheme`.
- Modern CSS, no UI framework needed. Keep it light and fast.
- Seed the DB with a small demo family for local dev (`/migrations/seed.sql` or a script), clearly separated from production.

## Phase 2: SMS (Twilio)

- Endpoint `POST /api/sms` as the Twilio webhook. **Validate the `X-Twilio-Signature`** (secrets `TWILIO_AUTH_TOKEN`) and reject anything invalid.
- Identify the sender by `people.phone`. Unknown numbers get a polite refusal and no data.
- Replies are TwiML. Keep handlers fast (Twilio expects a response within a few seconds).
- Strict commands first (no free-text parsing yet):
  - `list` shows your own list (spoiler rules apply), `list <name>` shows someone else's
  - `add <title>` adds to your list
  - `done <n>` or `claim <n>` acts on item numbers from the last list shown to that sender (store a short-lived mapping)
  - `ask <contact> about <person>` creates an idea request and texts the contact
  - A reply to an idea-request text is stored as the response and forwarded to the requester
  - `web` texts a fresh link to the web app
- Outbound SMS via the Twilio REST API for idea requests. Only people with a phone number can text in. Kids and phoneless people are handled via the web UI or their linked adults.

## Out of scope (for now)

- Per-person logins or OAuth
- Free-text or LLM command parsing
- Email notifications
- Payments, price tracking, or product scraping

## Deliverables and process

1. Scaffold the SvelteKit and Cloudflare project, `wrangler.toml` with a D1 binding, and the migrations above.
2. Implement auth (link, PIN, cookie, acting-as) with tests for the permission checks and spoiler stripping.
3. Build the pages and API in the order: people and settings, wishlist and claim flow, history, ideas requests.
4. Write a README covering local dev, creating the D1 database, setting secrets, deploying, and generating the family link.
5. Stop after phase 1 and confirm before starting the Twilio work.
