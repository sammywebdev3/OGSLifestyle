# OGUN STATE LIFESTYLE

A browser-based **2.5D isometric life simulation** set in Ogun State, Nigeria. Create a character, step out of
your starter apartment in Kuto (Abeokuta), and explore the neighbourhood. This repository is the **Phase 1
foundation**:

- the app shell;
- accounts;
- character creation;
- a playable Phaser prototype;
- a secure data layer that later phases build on.

> Virtual money only — it has no real-world value.

## Tech stack

| Area | Choice |
| --- | --- |
| App | Next.js 15 (App Router) with React 19 and TypeScript (strict) |
| Game | Phaser 3.90, loaded **only in the browser** |
| Styling | Tailwind CSS 3 |
| Backend | Supabase: Auth, Postgres and Row Level Security |
| Hosting | Vercel |

## Quick start

```bash
npm install
npm run dev        # http://localhost:3000
```

You don't need any credentials to run it.

- **Without Supabase credentials**, the app runs in **offline guest mode**. Your character is saved in your browser's
  `localStorage`, and its cash is shown with a **"preview"** label. It is not an authoritative balance.
- **With Supabase credentials** (see below), you get real accounts, and characters are stored server-side.

### Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` | Production build (what Vercel runs) |
| `npm start` | Serve the production build |
| `npm run typecheck` | TypeScript check (`tsc --noEmit`) |
| `npm test` | Unit tests with Node's built-in runner (validation, isometric maths, env, auth events, same-origin checks) |
| `npm run test:db` | Migration and RLS tests in a disposable local Supabase Postgres (Docker) |

Node 20.9 or newer is required. `npm test` uses Node's `--experimental-strip-types` flag, which needs **Node 22.6 or newer**.

## Environment variables

Copy `.env.example` to `.env.local` for local development. **Never commit `.env.local`**; it is git-ignored.

| Variable | Exposed to the browser? | Required? |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | yes | for online accounts |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | yes (safe: Row Level Security protects the data) | for online accounts (new projects) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes | only on older projects without a publishable key (fallback) |
| `NEXT_PUBLIC_SITE_URL` | yes | Production only (auth email links), e.g. `https://your-app.vercel.app`. Leave unset in Preview and locally (it falls back to the current URL) |
| `SUPABASE_SECRET_KEY` (or the legacy `SUPABASE_SERVICE_ROLE_KEY`) | **never** | not used yet; server-only, do not set it unless a feature needs it |

The app treats missing values, or the placeholder values from `.env.example`, as "not configured". It then falls back
to guest mode instead of crashing. The Supabase URL must be `https://` (or `localhost`).

**On Vercel** (Project → Settings → Environment Variables):

| Variable | Production | Preview |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ set | ✅ set |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (or legacy `…_ANON_KEY`) | ✅ set | ✅ set |
| `NEXT_PUBLIC_SITE_URL` | ✅ your production URL | ❌ **leave unset** |
| `SUPABASE_SECRET_KEY` | ❌ not needed yet | ❌ not needed yet |

`NEXT_PUBLIC_SITE_URL` must **not** be set for Preview. Confirmation links have to return to the same deployment
that started the sign-up, because the PKCE verifier cookie lives on that domain. When the variable is unset, the app
uses the current page's URL (the preview URL), which is what you want. A `NEXT_PUBLIC_*` value is built into the
bundle, so changing one requires a new deployment.

## Supabase setup (online accounts)

These are manual steps in **your** Supabase project. Nothing in this repo touches it automatically.

### 1. Authentication settings (dashboard)

- **Authentication → Sign In / Providers → Email:** enabled. **Confirm email** may stay on (recommended); the app
  shows "check your email" and finishes sign-in through `/auth/callback`.
- **Authentication → URL Configuration:**
  - **Site URL:** your production URL, for example `https://your-app.vercel.app`.
  - **Redirect URLs:** add every place a confirmation link may return to. Use `/**`, because the link carries a
    query string (`/auth/callback?next=/create`):
    - `http://localhost:3000/**`
    - `https://your-app.vercel.app/**`
    - optionally, preview deployments: `https://<project>-*-<your-vercel-team-slug>.vercel.app/**` (copy the
      team slug from any preview URL)
- **Sessions:** the app uses `@supabase/ssr` cookies (PKCE flow), so no extra setting is needed.
- **Email sending (SMTP):** Supabase's built-in email sender is for testing only. It has a very low sending limit
  (a handful of emails per hour), and while it is in use it may only deliver to your project team's addresses. With
  **Confirm email** on, sign-ups beyond that limit get no confirmation email. **Before opening registration to the
  public**, configure custom SMTP under **Authentication → Emails → SMTP Settings** (with any transactional email
  provider), and review the email rate limits under **Authentication → Rate Limits**.

### 2. Apply the migration: an explicit, manual step

The migration is `supabase/migrations/20261018000000_phase1_players.sql`. Run `npm run test:db` first. Then apply
it **once**.

**Recommended for this initial setup: the Supabase SQL Editor** (Dashboard → SQL Editor → New query).

1. **Pre-check:** every value returned must be `null`. If any is not, stop; the project already has these objects.
   ```sql
   select to_regclass('public.players'), to_regclass('public.inventories'),
          to_regclass('public.inventory_items'), to_regprocedure('public.create_character(text,jsonb)');
   ```
2. **Apply:** in a new query, type `begin;`, paste the **entire** migration file, end with `commit;`, then **Run**.
   Wrapping it this way makes the whole migration apply or nothing.
3. **Verify (read-only):**
   - RLS is on for all three tables;
   - `authenticated` has `SELECT` only, and `anon` has nothing;
   - `create_character` is owned by `postgres`, is `SECURITY DEFINER`, and has `search_path=""`.
   ```sql
   select relname, relrowsecurity from pg_class
    where relname in ('players','inventories','inventory_items') and relnamespace = 'public'::regnamespace;
   select table_name, grantee, privilege_type from information_schema.role_table_grants
    where table_schema = 'public' and grantee in ('anon','authenticated') order by 1,2,3;
   select pg_get_userbyid(proowner), prosecdef, proconfig, proacl
     from pg_proc where oid = 'public.create_character(text,jsonb)'::regprocedure;
   ```

**Full read-only check (any time, before or after changes):** paste
[`supabase/verify/phase1_live_check.sql`](supabase/verify/phase1_live_check.sql) into the SQL Editor and Run. It changes
nothing. It compares the live project with the reviewed migration: tables, RLS, policies, grants, constraints, and the
function's owner, settings, permissions and body. Every row should show `ok = true`. The SQL Editor re-indents pasted
text, so check 14 accepts a body that differs only in indentation or trailing spaces and says so
(`match=same code`). If it says `match=DIFFERENT`, run
[`supabase/verify/phase1_function_diff.sql`](supabase/verify/phase1_function_diff.sql) (also read-only) to see which
lines differ. `npm run test:db` checks that both scripts pass on the migration, accept whitespace-only variants, and
catch known-bad variants.

**Alternative: the Supabase CLI.** These are the documented commands, but **this CLI workflow has not been verified
for this repository**. The repo has no `supabase/config.toml` yet, and it was never run against a live project.

```bash
npx supabase login                         # opens a browser / asks for an access token
npx supabase init                          # creates supabase/config.toml; keeps existing migrations
npx supabase link --project-ref <project-ref>   # asks for the database password
npx supabase db push --dry-run             # review what would run
npx supabase db push
```

If you used the SQL Editor first and switch to the CLI later, mark the migration as already applied, so that
`db push` doesn't try to run it again:
`npx supabase migration repair --status applied 20261018000000`.

After the migration is live, regenerate the database types (see **Database types** below).

### 3. Keys

Copy the **Project URL** and the **publishable** key (or the legacy **anon** key) into `.env.local` and Vercel.
**Do not** put the secret or service-role key in any `NEXT_PUBLIC_*` variable, in source code, or in chat.

## Database types

- **`src/lib/supabase/database.types.ts`** is **generated**; never edit it by hand. The committed version was
  generated with `supabase/postgres-meta` from the migration applied to a local Supabase Postgres, so it describes
  the migration, not the live project.
- **`src/lib/supabase/rows.ts`** holds the hand-written aliases (`PlayerRow`, `InventoryRow`, `InventoryItemRow`). It
  derives them from the generated `Database` type, so regenerating never deletes them.

To regenerate after the migration is live:

```bash
npx supabase login
npx supabase gen types typescript --project-id <project-ref> --schema public > src/lib/supabase/database.types.ts
npm run typecheck   # if a table was renamed or removed, rows.ts fails here; update it
```

## Database tests (local, disposable)

```bash
npm run test:db   # needs Docker and the psql client
```

- **What it runs:**
  - starts the official `supabase/postgres:15.8.1.085` image in a throwaway container;
  - applies every migration as the `postgres` role, as Supabase does;
  - runs `supabase/tests/*.test.sql`;
  - runs real concurrency tests from separate connections.
- **What the checks cover:**
  - grants, Row Level Security and the database function's security settings;
  - Yoruba, Hausa and Igbo names, and invalid names;
  - anonymous and unauthenticated calls;
  - reads and writes against other users' data;
  - duplicate and simultaneous character creation.
- **Safety:** the container is removed afterwards. The script never reads `DATABASE_URL` or any Supabase credentials,
  so it cannot touch a real project.

## Multiplayer (Phase 3.1)

Signed-in players in the same area see each other move. The code lives in `src/features/multiplayer/`.

- **Transport:** Supabase Realtime **private** channels.
  - `mp:<room>` carries presence (who is here).
  - `mp:<room>:<player id>` carries one player's movement. Database policies let only that player send on it.
- **Profiles:** names and avatars come from `get_player_profiles()`.
- **Nothing is saved:** positions are never written to the database.
- **Migration:** `supabase/migrations/20261019000000_phase3_1_multiplayer.sql` adds two functions and three Realtime
  policies, and no tables. It must be applied to the live project (with approval) before multiplayer can connect.
  Until then the game runs solo and the HUD says "Multiplayer offline".
- **Guests** always play solo.
- **Setup and the two-account test plan:** [`docs/phase-3.1-multiplayer-test-plan.md`](docs/phase-3.1-multiplayer-test-plan.md).

## Multiplayer interaction (Phase 3.2)

Players can chat, see speech bubbles, and send emotes (👋 🤝 😂 ❤️) to players nearby.

- **Transport:** chat and emotes are broadcast events on the sender's own player topic. The existing Phase 3.1 policies
  already make sure only the owner can send there, so there is **no new migration**.
- **Storage:** nothing is stored; chat history lives in memory (the last 50 lines per tab).
- **Limits:** 200 characters per message, plus rate limits when sending and when receiving.
- **Rendering:** messages are always rendered as plain text, never HTML.
- **Code:** `src/features/multiplayer/chat.ts` and `bubbles.ts`, `src/components/game/ChatPanel.tsx` and `EmoteBar.tsx`.
- **Test plan:** [`docs/phase-3.2-interaction-test-plan.md`](docs/phase-3.2-interaction-test-plan.md).

## Land ownership (Phase 3.3A)

Players can buy one of 12 plots on Kuto Street from the game: basic ₦25,000, standard ₦50,000, premium ₦100,000.
Each plot has one owner, kept in the database, so ownership survives reloads.

- **Server authority:** the browser sends only `{ plotKey, requestId }`.
  - `buy_land_plot()` takes the buyer from the session and the price from the database.
  - It locks the player and plot rows, checks cash, deducts the price, assigns the owner and writes balanced ledger
    lines, all in one transaction.
  - A retried request (same `requestId`) is answered again and never charged twice.
- **Ledger:** cash that existed before this phase, including everyone's ₦50,000 starting cash, is *pre-ledger*.
  From Phase 3.3A on, every cash change writes a ledger line with the balance after it, against a `game:land-sales`
  counterparty.
- **Code:**
  - `src/features/land/`, `src/server/services/landService.ts`, `src/app/api/land/`
  - `src/components/game/LandDialog.tsx` and `LandPanel.tsx`
- **Migration:** `supabase/migrations/20261020000000_phase3_3a_land.sql`, with its rollback script in
  `supabase/rollback/`. It must be applied to the live project (with approval) before land works there. Until then
  the 🗺️ panel says "Land is not open on this server yet".
- **Not in this phase:** trading between players, building, companies, and new plot releases.
- **Plan, rollback and manual tests:** [`docs/phase-3.3a-land-test-plan.md`](docs/phase-3.3a-land-test-plan.md).

## Deploying to Vercel

1. Import the GitHub repo in Vercel. `vercel.json` sets the framework to Next.js. This matters for a Vercel project
   created when this repo was a static site: its saved Framework Preset ("Other") would otherwise make Next.js builds
   fail.
2. Add the environment variables as listed in the Production/Preview table above. Note that `NEXT_PUBLIC_SITE_URL` is Production only. Skip them all to deploy in guest-only mode.
3. Deploy. `npm run build` must pass, and it does at the time of writing.
4. **After changing any `NEXT_PUBLIC_*` variable, redeploy.** These values are built into the browser code at build
   time, so an existing deployment never picks them up. Use Deployments → ⋯ → **Redeploy** (or push a commit).

Live sign-up, confirmation and two-account checks: see [`docs/live-auth-test-plan.md`](docs/live-auth-test-plan.md).

## Project structure

```
src/
  app/                      Next.js routes (pages, layouts, API)
    page.tsx                Landing screen
    login/ register/        Auth screens
    create/                 Character creation
    apartment/              Starter apartment (game entry)
    play/                   The Phaser world + HUD
    api/player/route.ts     GET my character · POST create character (server-validated)
    api/health/route.ts     Liveness + whether online accounts are configured (no secrets)
    auth/callback/route.ts  Email-confirmation code exchange
  middleware.ts             Refreshes the Supabase session (no-op in guest mode)
  components/
    brand/                  Logo, isometric SVG kit, landing illustration
    ui/                     Button, Card, Notice, Spinner, PageShell
    auth/ character/ apartment/ player/   Screen components
    game/                   GameScreen, GameCanvas (client-only), Hud, inventory, prompts, touch D-pad
  game/                     Phaser code (browser-only)
    createGame.ts           Entry point — dynamically imports Phaser
    events.ts               Typed event bus between React and Phaser
    iso/isoMath.ts          Pure isometric projection + collision (unit-tested)
    world/starterArea.ts    Map data: tiles, buildings, props, interactables
    render/                 Isometric drawing helpers, buildings & props (placeholder art)
    entities/PlayerAvatar.ts
    scenes/StarterAreaScene.ts
  features/
    player/                 PlayerProvider (React context), API client, guest store
    auth/                   Sign-in / sign-up helpers
  lib/
    supabase/               env detection, browser/server clients, admin (server-only),
                            database.types.ts (generated) + rows.ts (aliases)
    validation/             Shared input validation (client + server)
  server/                   Server-side game services (import 'server-only')
    services/playerService.ts, landService.ts
    mappers/player.ts
  config/game.ts            Game constants (avatar options, items, starter values)
  types/                    Shared TypeScript types (player, inventory, game events)
supabase/migrations/        SQL schema, RLS policies, create_character(), land registry and ledger
```

## Gameplay prototype

| Action | Keyboard | Touch |
| --- | --- | --- |
| Move | WASD or arrow keys. Movement follows the screen: "up" walks up the screen. | On-screen D-pad (phones and tablets) |
| Interact | **E**, Space or Enter, near a glowing ring | The yellow prompt button |
| Inventory | **I** | 🎒 button |
| Land (plots for sale, your land) | **L**, or stand on a plot and press **E** | 🗺️ button |
| Back to the apartment | — | 🏠 button, or interact with the apartment door |

- **The map:** a Kuto street corner with Kuto Court (your apartment), Iya Basira Buka, Blessed POS, Mama T Stores,
  an okada park and a notice board.
- **Rendering:** everything is drawn in code as placeholder art. The map data (`src/game/world/starterArea.ts`) is
  separate from the drawing code (`src/game/render/`), so either can be replaced with real tilesets and sprites
  without changing the other.

## Security model (and what is *not* done yet)

- **Server authority.** The browser never decides balances, rewards or ownership.
  - Character creation sends only a name and an avatar. Any other fields, such as `cash`, are ignored.
  - The input is validated in the API route (`src/server/services/playerService.ts`) and again inside the
    database function `create_character()`. That function alone sets the starting cash (₦50,000) and the starter
    items.
- **Row Level Security** is on for every table.
  - Players can **read** only their own rows.
  - There are **no client write policies**. `anon` holds no table privileges, and `authenticated` holds `SELECT`
    only, so it has no insert, update, delete or truncate. (Truncate is not covered by Row Level Security.)
- **`create_character()`** runs `SECURITY DEFINER` with an empty `search_path`. Only `authenticated` can execute it;
  `anon` and `PUBLIC` cannot.
  - It always uses the caller's own user ID (`auth.uid()`); there is no parameter for anyone else's ID.
  - `UNIQUE(user_id)` makes duplicate or simultaneous requests safe.
- **CSRF.** `POST /api/player` accepts only `application/json` and refuses a cross-site `Origin`, on top of
  Supabase's `SameSite=Lax` cookies.
- **Secret / service-role key.** It is only read in `src/lib/supabase/admin.ts`, which imports `server-only`; the
  build fails if client code imports it. Nothing uses it yet.
- **Sessions.** Server code validates the session with `auth.getUser()` and never trusts a cookie on its own.
- **Guest mode** data is local and untrusted by design. It is clearly labelled and is never sent to the server as a balance.

**Not yet secure or implemented:**
- There is no economy yet: earning, spending, transfers and trading are all still to come. Those future actions need
  their own transactional, server-side functions and tests before the economy can be called secure.
- Rate limiting, abuse protection and multiplayer authority are Phase 2+ work.
- The migration and RLS policies **pass `npm run test:db`**, run against the official Supabase Postgres image
  locally. They have **not** yet been applied to the live project or tested through the real Auth and API services
  there. Do that once, with two accounts, after deploying.
- There is no rate limiting on `/api/player` or on sign-up. Supabase Auth has its own limits; add app-level limits
  before launch.

## Roadmap — Phase 2 and beyond

- Apply the migration to the real Supabase project (a manual step), regenerate types, and run an end-to-end sign-up with two users.
- Persist the player's position and location server-side, so you can travel between areas.
- Server-side economy actions (jobs and pay, shops, rent) as transactional database functions, with an audit log.
- Needs and time of day, and interiors you can enter (the apartment as a Phaser scene).
- Multiplayer presence with Supabase Realtime (other players moving around Kuto), plus chat with moderation.
- Real art: an isometric tileset, building sprites and an animated character spritesheet.
- More of Ogun State: Itoku, Panseke, Ibara, Oke-Mosan, then Ijebu-Ode, Sagamu and Ota.
