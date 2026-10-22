# OGUN STATE LIFESTYLE — Full-project audit and master completion checklist

- **Audited commit:** `main` @ `e919e77` (merge of PR #13, Phase 3.3A land).
- **Audit date:** 2026-10-22.
- **Method:** every file in the repository was read or sized (143 tracked files, about 10,000 lines including tests),
  plus the three migrations, the land service, the multiplayer protocol and client, the Phaser scene, the pages, the
  middleware and the test suites. Statuses below come from that code. Nothing was inferred from commit messages.
- **Not done in this audit:** no test, typecheck or build was run (the sandbox could not reach the npm registry), the
  production site and the Vercel dashboard were not inspected beyond a public page fetch, and no production SQL was run.
  Test counts are counted from the source, not from a run. See "Evidence limits" at the end.

## Status legend

| Label | Meaning |
| --- | --- |
| **VERIFIED WORKING** | Implemented, and covered by automated tests that exist in the repo (or, for production, an owner-reported check). |
| **PARTIAL** | Real code exists but the feature is incomplete, or only a slice of what a player needs. |
| **MISSING** | Nothing in the code. |
| **NEEDS TESTING** | Code exists but has no automated test of the behaviour, or has not been exercised on production. |

---

## 1. What the game is today, in one paragraph

A signed-in player creates a character (name plus 4 look choices), starts with ₦50,000 and 3 items, and walks around
**one** 20×18 isometric street (Kuto Street) in a Phaser scene. They can see other signed-in players move live, chat in
bubbles, send 4 emotes, and **buy one of 12 fixed land plots** through an audited double-entry ledger. That is the
whole loop. After buying land nothing further can be done with it, there is no way to earn money, and every shop,
NPC and interior is flavour text or a picture. The foundation underneath (accounts, row-level security,
server-authoritative money, idempotent purchases, append-only ledger, realtime rooms) is strong and well tested.
The **game on top of it** has not been built yet.

## 2. Feature-by-feature audit

### 2.1 Platform and security foundation

| Feature | Status | Evidence (code / tests) | Gap |
| --- | --- | --- | --- |
| Accounts: email sign-up, sign-in, callback, session refresh | **VERIFIED WORKING** | `src/features/auth/*`, `src/middleware.ts`, `AuthForm.tsx`; 2 authErrors tests, 2 authEvents tests; owner reports 2 real production accounts | Email sending limits not yet raised (see §3). **No password-reset ("forgot password") flow exists** (searched `src`: no reset or update-password code), so a player who forgets their password is locked out of their character. |
| Character creation (server-authoritative) | **VERIFIED WORKING** | `create_character()` in migration 1; `playerService.ts`; 7 validation tests; 32 SQL assertions in `phase1_players.test.sql` | Cannot be edited after creation. |
| Row-level security, grants, SECURITY DEFINER hygiene | **VERIFIED WORKING** (local) | All tables RLS-on; clients hold `SELECT` only or nothing; empty `search_path`; 148 SQL assertions across 4 files; `verify/*.sql` read-only live checks | Owner notes the full hosted security fingerprint was not conclusively re-verified. |
| Same-origin / CSRF check on POST | **VERIFIED WORKING** | `lib/http/sameOrigin.ts`, 3 tests | Only on routes that call it; new routes must too. |
| Double-entry ledger, append-only, idempotent purchases | **VERIFIED WORKING** (local) | Migration 3: balanced-ledger constraint trigger, append-only triggers, `economic_requests` idempotency; 59 SQL assertions; 14 HTTP integration tests | Ledger `kind` CHECK allows only `'land_purchase'`, so every new money flow needs an additive migration. |
| Security headers / CSP | **MISSING** | `next.config.ts` only sets `poweredByHeader: false` | No CSP, X-Frame-Options, Referrer-Policy, Permissions-Policy. |
| API rate limiting / abuse protection | **MISSING** | No rate-limit code anywhere (README says so too) | `/api/player`, `/api/land/buy` are unthrottled (DB is safe, availability is not). |
| Automated CI | **MISSING** | No `.github/workflows`; Vercel is the only status on the PR | Tests run only on a developer machine. |
| Staging database separate from production | **NEEDS TESTING** | Nothing in the repo shows one | Every migration goes straight to production. |
| Account deletion / data export | **MISSING** (and blocked by design) | Land + ledger FKs are `ON DELETE RESTRICT`; `verify/account_deletion_precheck.sql` documents that deletion is refused | Needs a reviewed fix-forward migration (anonymise or tombstone) before public launch. |
| Repo ↔ hosted schema drift | **NEEDS TESTING** | Hosted project has an `ensure_rls` event trigger and `public.rls_auto_enable()` that no migration creates (found during PR #13) | Repo migrations are no longer the full truth of production. |

### 2.2 Gameplay systems

| Feature | Status | Evidence | Gap |
| --- | --- | --- | --- |
| Walking, collision, camera, keyboard + touch D-pad | **PARTIAL** | `StarterAreaScene.ts` (326 lines), `isoMath` (3 tests), `TouchControls.tsx` | No automated test of the scene; no evidence of a real-phone test. Fixed-size map. |
| Locations / world | **PARTIAL** | One map `kuto-street` (`starterArea.ts`); `LocationId` has 2 values; no travel | Only one playable map; map data is hard-coded TypeScript. |
| Interiors | **PARTIAL** | `ApartmentRoom.tsx` is a static SVG on a web page (`/apartment`) | Not walkable, no objects, not multiplayer, not a Phaser scene. |
| Furniture | **MISSING** | The apartment furniture is painted into the SVG | No catalog, no placement, no persistence. |
| Construction / building on land | **MISSING** | Owning a plot only changes its colour in `StarterAreaScene` | No building table, types, cost, progress or rendering. |
| Land ownership and purchase | **VERIFIED WORKING** (DB + API local); UI **NEEDS TESTING** | Migration 3, `landService.ts`, `LandPanel/LandDialog/useLand`; SQL + API + unit tests (purchase 5, request 6, safety 6, mapping 4, plots 5) | No land purchase has been exercised on production (deliberately). Cannot sell, trade, rent or release plots. Only 12 plots exist. |
| Economy: earning money | **MISSING** | No jobs, wages, rewards or sales code; only `land_purchase` in the ledger | Player starts with ₦50,000, the cheapest plot is ₦25,000: the economy dead-ends after ≤2 purchases. **This is the biggest game-design hole.** |
| Economy: spending / shops | **MISSING** | Buka, POS and Mama T Stores are text in `INTERACTABLES` (Mama T has no interactable at all) | No item catalog table, no buy/sell RPC. |
| Inventory | **PARTIAL** | Server tables + read-only panel (`InventoryPanel.tsx`) | Items cannot be used, bought, sold, dropped or placed. 4 item definitions exist. |
| Needs, time of day | **MISSING** | Mentioned in README roadmap and NPC text only | No hunger/energy/clock state. |
| Jobs and careers | **MISSING** | None in this codebase | The previous game (backup branch `ogs-game-backup`, `js/careers.js`, `js/hustle.js`, `js/life.js`) has design content to reuse. |
| NPCs | **MISSING** | Interactables are static strings with a "Talk" verb | No NPC entities, dialogue, schedules or quests. |
| Character customization | **PARTIAL** | 2 bodies × 4 skins × 5 headwear × 6 outfits, in the creator and preview | Cannot change later; no clothing shop; avatars are code-drawn shapes. |
| Persistence | **PARTIAL** | Persisted: account, character, cash, inventory, land, ledger. | `players.location` exists but is never updated; position, needs, settings are not saved. Guest mode is `localStorage` only (by design). |

### 2.3 Multiplayer and social

| Feature | Status | Evidence | Gap |
| --- | --- | --- | --- |
| Presence + live movement (Supabase Realtime, private channels) | **VERIFIED WORKING** in code/tests; live use **NEEDS TESTING** | `multiplayer/client.ts` (17 tests), roster (10), motion (6), protocol (7), safety (3); Realtime RLS policies in migration 2 with 42 SQL assertions | No evidence in the repo of a two-browser test on production. Movement is client-authoritative (cosmetic only today). |
| Chat bubbles + chat panel | **VERIFIED WORKING** in code/tests | `chat.ts` (9 tests): sanitisation, NFC, bidi/zero-width stripping, rate limit | Session-only, nothing stored. **No profanity filter, report, mute or block.** |
| Emotes | **VERIFIED WORKING** in code/tests | `EMOTES`, `EmoteBar.tsx`, bubbles tests | 4 emotes only. |
| Friends, private messages, trading, gifting, parties | **MISSING** | None | Not needed for first release except basic safety tools. |
| Moderation / reporting / mute | **MISSING** | None | **Release blocker for public launch.** |
| Multiple rooms / scaling | **PARTIAL** | Room id is the location id; presence capped at 30 visible players | One room per map; a busy street would hit the cap. |

### 2.4 UI, mobile, art, audio, launch

| Feature | Status | Evidence | Gap |
| --- | --- | --- | --- |
| Landing, login, register, create, apartment, play pages | **VERIFIED WORKING** (builds in Vercel) | `src/app/*`; Vercel build success on `e919e77` | No UI tests. |
| HUD (chat, land, bag, apartment buttons) | **PARTIAL** | `Hud.tsx` | No needs/time/quest/phone UI. |
| Mobile support | **PARTIAL** | D-pad, responsive zoom 0.9/1.15, `dvh` layout | Never verified on a device from the repo; no PWA/orientation handling. |
| Art | **PARTIAL** | 100% code-drawn (no image assets in the repo) | Acceptable for first release; limits polish. |
| Audio | **MISSING** | None | Optional. |
| Error pages, loading states | **VERIFIED WORKING** | `error.tsx`, `not-found.tsx`, `Spinner`, `RequirePlayer` | — |
| Deployment (Vercel) | **NEEDS TESTING** | Vercel builds pass; the production branch and deployment environment of `e919e77` were not confirmable. The repo's default branch is the feature branch `ccr-41c89caf-ygke7x`, not `main` | Confirm Production deploys follow `main` (§3, blockers). |
| Admin / operations tools | **MISSING** | No admin UI or scripts; `getAdminSupabase()` exists but is unused | No way to add plots, adjust a balance, or ban except by raw SQL. |
| Observability (logs, error tracking, metrics) | **MISSING** | `console.error` only | Needed before opening to the public. |
| Automated tests overall | **PARTIAL** | 104 unit tests, ~148 SQL assertions plus harness checks, 14 API tests (counted from source) | No browser/E2E tests; no tests of Phaser scenes or React components. |

---

## 3. Dependencies, blockers and risks

### Dependencies (what must come first)

1. **Money must come in before it is useful to spend.** Jobs/shops (earning + item purchases) must exist before
   construction and furniture, otherwise nobody can afford them.
2. **Construction needs land** (done) and a **building catalog + ledger kind** (new).
3. **Furniture needs an interior scene** and **items that can be bought and placed**, so interiors, a shop catalog and
   inventory placement are one chain.
4. **NPCs, jobs and shops need the same dialogue/interaction layer**; build it once, as data, and reuse it.
5. **Every new money flow needs a ledger kind**, so the CHECK constraint on `economy_transactions.kind` and
   `ledger_entries.account` must be widened by one carefully tested migration up front.

### Blockers

| Blocker | Why it matters | Needed from |
| --- | --- | --- |
| **No CI, and the agent sandbox cannot reach the npm registry** | Typecheck/test/build cannot be run by the agent. Unverified code must not be shipped. | A GitHub Actions workflow (added on the audit branch, see §7). |
| **Migrations are applied by hand to production** | Each DB-touching phase waits on the owner. Slowest step in the whole plan. | Owner: batch migrations, one per day; run the repo's read-only verify script after each. |
| **No staging database** | A bad migration lands on the live database. | A second free Supabase project for rehearsal (recommended, ~30 minutes). |
| **Production branch / deploy status unconfirmed** | Merges to `main` may not go live. | Owner: read Settings → Git → Production Branch in Vercel. |
| **Default SMTP limits** | New sign-ups silently fail beyond a few per hour (README states this). | Owner: configure custom SMTP before public launch. |

### Security risks (highest first)

| # | Risk | Severity | Fix |
| --- | --- | --- | --- |
| S1 | Chat has no moderation, reporting, mute or block | High for a public launch | Mute/block + report table + server-side word filter on display; rate limit already exists. |
| S2 | No CSP / security headers | Medium | Ship the safe headers first; CSP in Report-Only mode, then enforce after testing against Phaser and Realtime. |
| S3 | No API rate limiting (`/api/player`, `/api/land/buy`, future routes) | Medium | Per-user limits inside the database functions (cheap, no new infra) plus Vercel/WAF limits. |
| S4 | Account deletion refused by FKs | Medium (privacy/compliance) | Fix-forward migration: anonymise the player row rather than delete ledger history. |
| S5 | Client-authoritative movement | Low today, High if anything economic ever depends on position | Do not gate money on position; if proximity rules are needed, validate server-side from the NPC/shop id only. |
| S6 | Hosted schema contains objects not in the repo (`rls_auto_enable`) | Medium | Capture current production schema as a baseline; keep verify scripts tolerant of known helpers (done for check 21). |
| S7 | Any player can open arbitrary `mp:<name>` room topics | Low | Restrict the policy regex to known room ids when more maps exist. |
| S8 | Service-role client exists but is unused | Low now | Design wages/timers so no cron or secret-key job is needed (compute from timestamps inside RPCs). |
| S9 | No secret scanning performed in this audit | Unknown | Run a secret scan in CI. |

---

## 4. Prioritised master checklist

Effort: **S** ≤ half a day, **M** about a day, **L** 1.5–2 days. "DB" = needs a production migration applied by the owner.

### MUST-HAVE for a complete first release (the "core loop")

The first release is complete when a new player can: sign up → create a character → earn money → buy food and
furniture → buy land → build a home on it → furnish and enter it → see and talk to other players safely, on phone or
desktop, with their progress saved.

| Priority | Item | Depends on | Effort | DB |
| --- | --- | --- | --- | --- |
| P0 | Confirm Vercel production branch and that `main` deploys to Production | — | S | no |
| P0 | GitHub Actions CI: typecheck, unit tests, build; DB/API tests as non-blocking at first | — | S | no |
| P0 | Safe security headers (nosniff, frame, referrer, permissions); CSP Report-Only | CI | S | no |
| P0 | Ledger widening migration: new transaction kinds and accounts (`wage`, `shop_purchase`, `construction`) | — | S | **DB** |
| P1 | **Earning loop:** a few jobs/gigs as server-timed shifts with cooldown, paid from a game account through the ledger (e.g. Mama T Stores shift, okada ride, buka helper) | ledger widening | M | **DB** |
| P1 | **Shops + item catalog:** `items` table, `buy_item` RPC, shop UI opened from Buka/Mama T/POS; give items real definitions | ledger widening | M | **DB** |
| P1 | **Inventory use + needs:** hunger/energy computed from timestamps (no cron); eating consumes items | shops | M | **DB** |
| P1 | **Construction on owned land:** `buildings` table, 3 house types, price through the ledger, build time computed from timestamps, rendered in the scene for everyone | earning, land | L | **DB** |
| P1 | **Interior scene + furniture:** walkable interior (reuse the iso engine), furniture catalog bought in shop, placement on a grid validated by the database, persisted | construction, shops | L | **DB** |
| P1 | **Interaction layer as data:** NPC dialogue and actions (job, shop, travel) defined in data, one UI | — | M | no |
| P1 | **Persist location and spawn:** write location on scene change; spawn at last place/home | — | S | **DB** |
| P1 | **Second location + travel** (e.g. Itoku market) from map data, using the same room/presence system | interaction layer | M | **DB** (plots) |
| P1 | **Safety v1:** mute/block, report, display-side word filter; DB-level per-user rate limits on money RPCs | — | M | **DB** |
| P1 | **Account deletion safe path** (anonymise, keep ledger) | — | S | **DB** |
| P2 | Mobile pass on a real device: HUD, dialogs, D-pad, landscape, keyboard-overlap with chat | — | M | no |
| P2 | Character look editing + a few cosmetic items from shops | shops | S | **DB** |
| P2 | Observability: error reporting, request logging, an operations SQL cheat-sheet | — | S | no |
| P1 | **Password reset** ("Forgot password" + set-new-password page) using Supabase Auth; no schema change | — | S | no |
| P2 | Custom SMTP for sign-up and reset emails; Supabase auth rate limits reviewed | — | S | config |
| P2 | Launch QA: end-to-end bug bash on production with two accounts, hosted verify scripts, rollback notes | all | M | no |

### OPTIONAL / future (do not block the first release)

- More towns (Ijebu-Ode, Sagamu, Ota, Ibara), many more plots, plot trading / resale / rent.
- Friends list, private messages, gifting, parties, guilds.
- Vehicles and okada riding as gameplay, a phone app UI, quests, seasons, events, leaderboards.
- Real isometric art, character spritesheets, animation, audio and music.
- Businesses owned by players (shops they run), marketplace, bank/savings, taxes.
- Admin dashboard, content editor for maps and dialogue, analytics.
- Server-authoritative movement and anti-cheat; sharding rooms beyond 30 visible players.
- Native/PWA install, push notifications, localisation (Yoruba).

---

## 5. Fastest safe implementation order (with the seven-day window)

| Day | Work | Who must act |
| --- | --- | --- |
| **0 (today)** | Audit doc, CI workflow, safe headers. Confirm Vercel production branch. | Owner reads Vercel setting; reviews the audit branch |
| **1** | Ledger-widening migration + jobs/shifts RPCs + shop/item catalog (one combined migration, rehearsed on staging) | Owner applies the migration, runs the verify script |
| **2** | Shop UI, job interactions, inventory use, hunger/energy; interaction-as-data layer | — |
| **3** | Construction: table, RPC, three house types, rendering | Owner applies migration |
| **4** | Interior scene, furniture catalog, placement RPC and UI | Owner applies migration |
| **5** | Second location + travel, location persistence, NPC dialogue content | Owner applies migration |
| **6** | Safety v1 (mute/block/report/filter), per-user rate limits, account deletion path, mobile pass | Owner applies migration |
| **7** | End-to-end QA on production with two accounts, fixes, hosted verification, launch notes | Owner |

Rules to keep it safe and fast: **one migration per day** applied in the morning; every migration ships with its SQL
tests, a rollback file and a read-only verify script (the Phase 3.3A pattern); every RPC derives the player from
`auth.uid()`, never takes money or prices from the client, and writes the ledger; no scheduled jobs (compute from
timestamps); never gate money on client position; no force-push, no direct production edits.

## 6. Is seven days realistic?

**For the must-have core loop above: realistic but tight, roughly a 60–70% chance** of a stable playable loop. (This is
a judgment, not a measurement.) The basis:

- **Pace so far:** Phase 1, 3.1, 3.2 and 3.3A landed over about four days, each with tests, rollback and verify
  scripts. That is about one rigorous phase per day.
- **The must-have list is about seven phases of that size**, so there is no slack. Each DB phase also waits for the
  owner to apply and verify a production migration, which is the main schedule risk.
- **Mitigations:** batch DB work into fewer, larger migrations; rehearse on a staging project; reuse the existing
  patterns (the ledger, `get_*`/`buy_*` RPCs, the iso engine, the realtime rooms); reuse design content from the old
  game on `ogs-game-backup` (careers, hustles, events) instead of inventing it.
- **If a day slips,** cut in this order: second location, character look editing, furniture variety (keep 8–10 items),
  construction to 2 house types.

**Not realistic in seven days:** the "entire game" as imagined in the old roadmap (all Ogun towns, real art and
audio, vehicles, player businesses, trading, friends). Plan those as later releases. Also not realistic: shipping the
core loop **without** moderation. Safety v1 is in the must-have list on purpose.

## 7. What was done with this audit

- The CI workflow (`.github/workflows/ci.yml`) and this document were added on the branch
  `audit/master-checklist`. **Nothing was merged to `main`, nothing was deployed, no production SQL was run.**
- The CI workflow has **not been run yet**. Its first run on GitHub is the first real proof that it works.

## Evidence limits (read before relying on this document)

- Test counts come from reading the test files, not from running them. The earlier reported results (104/104 unit, 256
  DB, 14 API) were not re-run in this audit.
- "VERIFIED WORKING" for database features means verified by the repo's local test suite. For production it relies on
  the owner's reported checks, and the owner noted the hosted security fingerprint was not conclusively re-verified.
- Live behaviour (two browsers moving in the same room, a land purchase on production, mobile devices) was not
  observed in this audit.
- Vercel's production branch and the Production/Preview status of `e919e77` were not confirmable from GitHub.
