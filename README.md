# Family Wishlist

A small, link-and-PIN protected web app for a family to share present wishlists, claim gifts, and keep a record of what everyone has received. Built with SvelteKit on Cloudflare Workers and D1, all on the free tier. See [SPEC.md](SPEC.md) for the full design.

Phase 1 (the web app) and phase 2 (text messages via Twilio) are both built. Text messages are optional: see [Text messages](#text-messages).

## How it works

- **Getting in:** open the family link `/join/<FAMILY_TOKEN>` once per device, or enter the family PIN. The device then stays signed in for a year.
- **Who are you:** pick yourself from the family. If you set a personal PIN, the app asks for it once per browser session.
- **Acting as:** the header switcher lets anyone act as anyone in the family (kids, grandparents without a phone), with no setup. Someone with a personal PIN can only be switched to after entering their PIN, once per browser session.
- **Family members:** an admin adds people with just a name, an optional mobile (for texts) and whether they're an admin, or several at once under **Add several family members**: one per line, name then mobile (`Grandma June +61 400 000 003`). If any line has a problem, nobody is added and each bad line is listed. Removing someone deletes their list, sizes and idea requests. Claims they made on other lists (current, past and evergreen) are kept without their name, so nothing gets bought twice and Past gifts stays complete.
- **Admins:** family members marked as admin get an **Admin** page to add, update and remove family members, grant admin, reset forgotten PINs, clear PIN lockouts, and sign out every device. Admin access only works while the admin has a personal PIN, so it is always behind a PIN check.
- **Recommenders:** in Settings, each person (or whoever is acting for them) ticks the family members who know what they'd like. Admins can set anyone's on the Admin page.
- **Asking for ideas:** "Ask for ideas" on someone's wishlist asks all of their recommenders (never the person asking). If they have none, it asks the person themselves to add to their list. The first answer to each request is added to that person's list (as "Suggested by …") as well as being sent to whoever asked.
- **Adding items:** the **Add Item** and **Bulk Add Items** buttons at the top of a wishlist open a form in a pop-up. Bulk Add Items takes one item per line, in the same format as texting `add` (see "Ideas format" below).
- **Sizes:** each person's page has a Sizes section of free-text pairs ("Shoes: AU 9"), added with the **Add Size** and **Bulk Add Sizes** buttons (pop-ups; bulk takes `item: size` lines, the same as by text) and changed under **Edit sizes**. Each shows when it was last updated, flagged once it's over a year old. Everyone can see them; the person, or whoever is acting as them, changes them.
- **Always-wanted items:** tick "Always wanted" for things that are always welcome (fancy shampoo, chocolates). They stay on the list after they're claimed, show who claimed them in the last 6 months, and each claim appears in Past Gifts. A person can claim one once per 6 months.
- **No spoilers:** when you view your own list, claimed items look like ordinary wanted items, and Past Gifts and idea requests about you are hidden. This is enforced on the server: the data for your own list never includes who claimed what.
- **Claiming is the last step:** there's no separate "given" step. A claimed item stays on everyone else's list as "Claimed by …" until the owner removes it.
- **Nothing is lost:** removing a claimed item archives it instead of deleting it. Past Gifts lists everything claimed for a person (including each claim on an always-wanted item), dated by when it was claimed: the last 12 months, with an option to show everything.

### How long people stay signed in

- **Family link or family PIN:** one year on that device, or until an admin uses "Sign out every device" (or `COOKIE_SECRET` changes).
- **Who you are:** a person without a personal PIN is remembered for a year. A person with a PIN (including every admin) is remembered only for the browser session, then asked for their PIN again. Some phone browsers restore sessions rather than ending them, so this can last longer in practice.
- **Acting as someone else:** for the browser session.

## Styling and accessibility

Styles follow the conventions of the [house](https://github.com/amykapernick/house) project: custom CSS only, PostCSS (advanced-variables, nesting, mixins, hexrgba) configured in `config/postcss.config.js`, global styles and mixins in `src/lib/styles`, and a `.module.css` file beside each component (`src/lib/components/parts/<Name>/`) and page. Import mixins with `@import '@mixins';` and `@include`.

- **Colours:** `src/lib/styles/global/palette.css` holds the base palette and `colours.css` the semantic tokens (`--page_bg`, `--text_secondary`, `--border`…), using house's names. Values marked _(placeholder)_ weren't available outside house's colours API; swap in the real values to match exactly.
- **Light and dark:** follows the system setting, or the header switch (saved in the browser). Tokens use `light-dark()`, so the system theme works without JavaScript.
- **WCAG 2.2 AAA:** text colours are tuned to at least 7:1 against every background they sit on, which meant darkening house's purple and navy in light mode and darkening its dark-mode surfaces. Buttons use a darkening gradient for the same reason, links are always underlined, and every control is at least 44px tall. Check changes with axe's `color-contrast-enhanced` rule in both themes.
- **Linting:** `npm run lint` runs Prettier (code) and stylelint (CSS, using house's stylelint setup). Stylelint owns CSS formatting, so Prettier skips `.css` files.

## Text messages

Anyone with a phone number saved in Admin can text the family's Twilio number:

| Text                        | What happens                                                                                                    |
| --------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `list`                      | Your own list (claims are never shown).                                                                         |
| `list <name>`               | Their list: what's still available plus anything you've claimed. Other people's claims are only counted.        |
| `list <name> all`           | Everything, with who claimed what.                                                                              |
| `claim <item or number>`    | Claims from the last list you were sent (for 30 minutes), by any unique part of its name. Claiming is final.    |
| `claim <item> for <name>`   | Claims from someone's list without listing it first (if several items match, you're asked which).               |
| `add <item>`                | Adds to your own list. Several items, one per line (see "Ideas format" below).                                  |
| `ask about <name>`          | Texts that person's recommenders (or the person, if they have none) for ideas.                                  |
| `sizes`, `sizes for <name>` | Your sizes, or someone else's, each with when it was last updated.                                              |
| `size <item>: <size>`       | Adds or changes one of your sizes, one per line. `size hat: remove` removes one.                                |
| `web`                       | Texts the family link. Opening it on your phone signs you straight in as you (after your PIN, if you have one). |
| `help`                      | Examples of every command. `<command> help` (like `add help`) explains one, with examples.                      |
| anything else               | Answers your newest open idea request: each idea is added to that person's list and forwarded to whoever asked. |

A number that isn't anyone's phone gets one polite refusal, then no reply at all.

**Ideas format** (for `add`, answers to idea requests, and replies on the Requests page): one idea per line. A link (`https://…` or `www.…`) anywhere on the line becomes the item's link, text after `-` becomes its notes, and `always` as the first or last word marks it as always wanted. List markers like `1.` or `-` at the start of a line are ignored. For example:

```
Dinosaur puzzle - the 100 piece one
Fancy shampoo always https://example.com/shampoo
```

### How it works

Twilio posts each text to `POST /api/sms`. The webhook checks the `X-Twilio-Signature` header (anything unsigned or invalid gets a 403), runs the text through `runSms()` and `handleSms()` with the same permission and spoiler rules as the website, and replies with TwiML. Texts to other people (idea requests and forwarded answers) go out through Twilio's REST API after the reply, so Twilio isn't kept waiting. The last list sent to each phone is kept in D1 (`sms_contexts`) for 30 minutes.

SvelteKit's built-in cross-site form check would block Twilio (it posts forms with no `Origin` header), so `vite.config.ts` turns it off and `hooks.server.ts` runs the same check for every route except `/api/sms`.

### Setting up Twilio

1. Buy a number with SMS in the [Twilio console](https://console.twilio.com/).
2. Set the secrets:

   ```sh
   npx wrangler secret put TWILIO_ACCOUNT_SID    # AC..., from the console dashboard
   npx wrangler secret put TWILIO_AUTH_TOKEN     # from the console dashboard
   npx wrangler secret put TWILIO_FROM_NUMBER    # the number, e.g. +61400999000
   ```

3. In the number's **Messaging configuration**, set "A message comes in" to **Webhook**, `https://gifts.kaperscrewe.au/api/sms`, **HTTP POST**.
4. Add family members' mobile numbers in Admin (international format, like `+61400000000`).

Without the secrets, `/api/sms` returns 503 and the rest of the app works as normal. Failed outbound texts are logged (`npx wrangler tail`).

### Trying it locally

Run `npm run dev` and open **SMS preview** in the nav (`/dev/sms`, dev only, 404 in production). Pick whose phone you're holding and text the family number (the message field suggests every command, with your family's names and items, as you type). It runs the same `runSms()` as the webhook against your local database, minus the signature check and real texts. Beside the phone, **Step through** shows every step: the request Twilio would send, the sender lookup, the parsed command, each check and database write, the TwiML response, and any texts to other people (which land on their phone in the sandbox, so switch phones to reply as them). Untick "Save changes" to try something without writing, and `npm run db:reset:local` restores the demo data.

To test with real texts locally, expose the dev server with a tunnel (`cloudflared tunnel --url http://localhost:5173` or ngrok), point the Twilio number's webhook at `<tunnel>/api/sms`, and add the `TWILIO_*` values to `.dev.vars`, including `TWILIO_WEBHOOK_URL` set to that same public URL so signatures match.

Code: `src/lib/server/sms/`: `handle.ts` (commands), `run.ts` (last-list storage), `commands.ts` (parsing), `format.ts` (message text), `twilio.ts` (signatures, TwiML, sending). The webhook is `src/routes/api/sms/+server.ts`.

## Local development

Requires Node 22.18 or newer (the helper scripts run TypeScript directly).

```sh
npm install
cp .dev.vars.example .dev.vars   # local secrets: family PIN 1234
npm run db:reset:local           # create the local D1 tables and load the demo family
npm run dev
```

Then open <http://localhost:5173/join/local-dev-family-token>, or go to <http://localhost:5173> and enter PIN `1234`.

The demo family is Alex, Sam, Mia, Leo and Grandma June. Alex is the admin, with the personal PIN `1357`. Sam has the personal PIN `2468`. Anyone can act as Mia, Leo or June; switching to Alex or Sam needs their PIN. The seed data lives in `seed/demo.sql`, apart from the migrations, and **wipes the tables**, so only ever run it locally.

Useful commands:

| Command                            | What it does                                                  |
| ---------------------------------- | ------------------------------------------------------------- |
| `npm run dev`                      | Dev server with the local D1 database and `.dev.vars`         |
| `npm test`                         | Unit tests (permission rules, spoiler stripping, crypto)      |
| `npm run check`                    | Type check and Svelte checks                                  |
| `npm run build && npm run preview` | Production build in the real Workers runtime (`wrangler dev`) |
| `npm run db:reset:local`           | Apply migrations and reload the demo family                   |
| `npm run dev:live`                 | Dev server against the live database (careful)                |
| `npm run db:pull` / `db:push`      | Copy the live database to local, or local to live             |
| `npm run hash-pin -- 1234`         | Hash a PIN for `FAMILY_PIN_HASH`                              |
| `npm run new-secret`               | Generate a random value for `FAMILY_TOKEN` or `COOKIE_SECRET` |

### Working with the live data

- **`npm run db:pull`** replaces your local database with a copy of the live one (schema, data and migration history), so `npm run dev` shows the real family.
- **`npm run db:push`** does the reverse: the live database becomes a copy of your local one. Anything changed on the live site since your last pull is lost, so it asks you to type `yes` first. Pull, change things locally, then push straight away.
- **`npm run dev:live`** runs the dev server against the live database directly (`env.live` in `wrangler.jsonc`), with a "Live database" banner on every page. Everything you do there is real, including **Save changes** in the SMS preview. Secrets still come from `.dev.vars`, so sign in with your local family link or PIN. Personal PINs are the live ones, because they're stored in the database.

Pull and push both back up the database they replace to `backups/` first (gitignored, as it holds real family data). To put a backup back: `npm run db:restore -- local <file>` or `npm run db:restore -- live <file>`. Cloudflare also keeps 30 days of history for the live database: `npx wrangler d1 time-travel restore DB --timestamp <time>`.

`npm run db:reset:local` replaces whatever you pulled with the demo family again.

Note: SvelteKit only enforces its cross-site form protection in production builds, so check anything CSRF-related with `npm run preview`.

## Deploying to Cloudflare

1. **Log in:** `npx wrangler login`

2. **Create the database** and copy the `database_id` it prints into `wrangler.jsonc`:

   ```sh
   npx wrangler d1 create family-wishlist
   ```

3. **Create the tables:**

   ```sh
   npm run db:migrate:remote
   ```

4. **Set the secrets.** Each command prompts for the value:

   ```sh
   npm run new-secret                      # copy the output, then:
   npx wrangler secret put FAMILY_TOKEN

   npm run new-secret                      # a different value, then:
   npx wrangler secret put COOKIE_SECRET

   npm run hash-pin -- <your family PIN>   # copy the pbkdf2$... output, then:
   npx wrangler secret put FAMILY_PIN_HASH
   ```

   The first time you run `wrangler secret put`, it may offer to create the Worker. Say yes.

5. **Deploy:**

   ```sh
   npm run deploy
   ```

6. **Add your family.** Open the family link (below). The first visit to an empty family asks for your name and a personal PIN, makes you the admin, and takes you to **Admin** to add everyone else.

### Making someone an admin

Admins can promote other people on the Admin page (they then set a PIN in Settings to switch it on). If no one is an admin, for example on a database created before admin support, promote someone from the command line, then have them set a PIN in Settings:

```sh
npx wrangler d1 execute DB --remote \
  --command "UPDATE people SET is_admin = 1 WHERE name = 'Your name'"
```

The app always keeps at least one admin with a PIN: the last one can't be demoted or removed, and admins can't remove their own PIN.

### Upgrading an existing deployment

Run `npm run db:migrate:remote` before `npm run deploy` whenever there are new files in `migrations/`.

## The family link

The link is `https://gifts.kaperscrewe.au/join/<FAMILY_TOKEN>` (the custom domain in `wrangler.jsonc`; the `*.workers.dev` address works too), using the token you set in step 4. Texting `web` sends the same link with `?me=<person>` added, which signs that phone straight in as its owner (asking for their PIN if they have one). Share it privately (for example in a family group chat). Anyone with the link gets in for a year on that device, and anyone without it needs the family PIN.

To sign every device out, an admin can use **Admin → Sign out every device**. If the link itself leaked, also set a new `FAMILY_TOKEN` (and change the family PIN with a new `FAMILY_PIN_HASH` if that leaked too). Changing `COOKIE_SECRET` also signs everyone out.

## Project layout

```
migrations/           D1 schema (applied by `wrangler d1 migrations apply`)
seed/demo.sql         demo family for local dev only
scripts/              hash-pin and new-secret helpers
src/hooks.server.ts   family cookie check and acting-as resolution on every request
src/lib/server/
  permissions.ts      pure permission rules (who can claim, edit, act as, ...)
  spoilers.ts         turns items into what the viewer is allowed to see
  session.ts          signed cookies and Cloudflare env
  crypto.ts           PBKDF2 PIN hashing and HMAC cookie signing (WebCrypto)
  db.ts               D1 queries
  sms/                text message commands, Twilio signatures, TwiML and sending
src/lib/styles/       global styles, palette, mixins (house conventions)
src/lib/components/   parts/, partials/ and layouts/, each with an index.module.css
src/routes/           pages: /, /people/[id], /history, /ask, /requests, /settings, /admin, /pin, /join, /dev/sms
src/routes/api/sms/   the Twilio webhook
```

Every write goes through a form action that loads identity from signed cookies, re-checks permissions in `permissions.ts`, and uses conditional `UPDATE ... WHERE status = 'wanted'` statements so two people can't claim the same thing.
