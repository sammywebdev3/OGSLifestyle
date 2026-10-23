# Phase 3.4A: jobs and shops: plan, deployment, rollback and test plan

Signed-in players can work timed shifts for pay and buy food, drinks and an adire scarf at two Kuto shops.
Every naira moves through the Phase 3.3A ledger.

**Status:** tested on throwaway local databases (Postgres 15.8 and 17.6), against a local build over HTTP, and in a
local browser at phone width (section 5). **It is not on the live project.** It works there only after the migration
has been applied, with approval, and section 4 passes.

**Not in this phase:** hunger and energy (the food bought here has no effect yet), skills, job levels, selling items
back, and trading between players.

## 1. How it works

| Piece | Details |
|---|---|
| **Catalogue** | `jobs` (3 jobs) and `shop_items` (6 items in 2 shops), seeded by the migration. Pay, shift length and prices live **only** in the database. |
| **Jobs** | Buka helper ₦1,500 for 2 min; POS attendant ₦4,000 for 5 min; okada rider ₦9,000 for 10 min. |
| **Shops** | Iya Basira Buka: puff-puff ₦300, zobo ₦400, amala plate ₦1,500 (at most 5 per purchase). Mama T Stores: pure water ₦50 (at most 20), Agege bread ₦800, adire scarf ₦6,500 (at most 2). |
| **Shifts** | `start_job_shift(job_key)` records a shift with the job's pay fixed at that moment, and an end time from the server's clock. One shift at a time (unique index). At most 20 shifts in any 24 hours (`OG429`). `abandon_job_shift()` stops it without pay. |
| **Pay** | `claim_job_shift(request_id)` pays the caller's finished shift: it locks the player row, then the shift row, refuses before the end time (`OG425`), adds the pay, writes a `job_payout` transaction with two ledger lines (player +pay, `game:wages` −pay), and marks the shift paid. A unique index allows one payout per shift. A retry with the same request id is answered again (`replayed: true`) and pays nothing. |
| **Shopping** | `buy_shop_item(item_key, quantity, request_id)` takes the price from `shop_items`. It locks the player row, checks the per-purchase limit (`22023`), cash (`OG402`) and a 999-per-item bag limit (`OG409`), deducts cash, adds the items, and writes a `shop_purchase` transaction (player −total, `game:shop-sales` +total). A retry with the same id and the same item and quantity is replayed; the same id for anything else is refused (`OG422`). |
| **Reads** | `get_my_jobs()` returns the board, the caller's shift in progress, today's count and the server time. `get_shop(shop_key)` returns one shop's items. Neither returns other players' data. |
| **Access** | RLS on, no policies, and no client privileges on `jobs`, `job_shifts`, `shop_items`. Only the 6 functions above are callable, only by `authenticated`. A trigger refuses deleting shifts, changing a finished shift, and changing anything but the status. |
| **API** | `GET /api/jobs`; `POST /api/jobs/start` `{ jobKey }`; `POST /api/jobs/claim` `{ requestId }`; `POST /api/jobs/abandon` `{}`; `GET /api/shop?shop=buka\|mama-t-stores`; `POST /api/shop/buy` `{ itemKey, quantity, requestId }`. Any other field (pay, price, cash, player id) gets a 400. Same-origin JSON only, at most 1 KB, the player's own session, never the service-role key. |
| **UI** | 💼 button or **J** opens "Work & shops". The countdown runs on the server's clock. Cash and bag counts change only from the server's answer. After a network or server failure, "Try again" re-sends the same request id, so it cannot pay or charge twice. |
| **Untouched** | Land, the ledger rules, `create_character`, players, inventories and multiplayer are unchanged. `npm run test:db` checks this. |

### Ledger accounts after this phase

| Account | Meaning |
|---|---|
| `player` | the player's side of every cash change, with the balance after it |
| `game:land-sales` | the game's side of land purchases (Phase 3.3A) |
| `game:wages` | the game's side of wages: **new money** entering the economy (negative) |
| `game:shop-sales` | the game's side of shop purchases: money leaving circulation (positive) |

The invariant still holds: sum of all `players.cash` + sum of all `game:*` lines = total pre-ledger cash.

### Schema changes to existing tables (widening only)

The migration widens three Phase 3.3A constraints. Existing rows are unchanged, and the upgrade path is tested
against a 3.3A database that already holds a land purchase.

- `economy_transactions`: kind adds `job_payout` and `shop_purchase`. New nullable columns `job_shift_id`, `item_key` and `quantity`. A new check requires exactly the right detail columns for each kind.
- `ledger_entries`: account adds `game:wages` and `game:shop-sales`.
- `economic_requests`: kind widened. `plot_id` becomes nullable, but is still required for `land_purchase`.

## 2. Migration, verification and rollback

**Migration:** `supabase/migrations/20261023000000_phase3_4a_jobs_shops.sql`.
- It starts with a guard: it refuses to run unless Phase 3.3A is present.
- It uses plain `create` statements, so a second run fails and changes nothing (tested).

**Verify (read-only):** `supabase/verify/phase3_4a_economy_check.sql`.
- Run it inside `begin transaction read only; … rollback;`.
- Every row should be `ok = true`.
- It replaces `phase3_3a_land_check.sql` once 3.4A is applied. The old check then reports differences by design.
- It fingerprints tables, columns, constraints, the two unique indexes, triggers, grants, function bodies and the catalogue. It also checks ledger, ownership and shift consistency.
- It returns counts only: no ids, names or balances.

**Rollback:** `supabase/rollback/20261023000000_phase3_4a_jobs_shops_down.sql`.
- It restores the exact 3.3A schema, and the 3.3A check passes again (tested).
- It **refuses**, changing nothing, once any shift has been started or any job or shop money has moved. Wages are already in players' cash, so after that point **fix forward** with a reviewed migration instead.

**Account deletion pre-check:** `supabase/verify/account_deletion_precheck.sql` now also counts work shifts.
- Shifts reference players with `ON DELETE RESTRICT`.
- It runs unchanged on a 3.3A database.

### Steps for the live project (each needs the owner's approval)

1. Take a backup (Free plan: export from your own machine; Supabase's Free backups cannot be downloaded).
2. Run `phase3_3a_land_check.sql` read-only. It must be all `true` (the current production state).
3. In the SQL Editor: `begin;` + the whole migration + `commit;`.
4. Run `phase3_4a_economy_check.sql` read-only. Every row must be `true`, and i1 must show the existing purchase unchanged (`owned plots=1 transactions=1 ledger lines=2 paid shifts=0 shop purchases=0`).
5. Deploy the app (merge after review). Until step 3, the panel says "Jobs and shops are not open on this server yet" (503).
6. Regenerate `database.types.ts` from the live project and confirm there is no diff.

**Preview warning:** Preview deployments currently use the **production** Supabase project. Do not run section 4
against Preview until Preview has its own database: shifts and purchases there are real economy changes.

## 3. Automated tests

| Command | What it proves for this phase |
|---|---|
| `npm test` | Request parsing (extra fields refused, key shapes, quantity range, request ids, CSRF), answer mapping, error codes, the retry state machine, the server-clock countdown, and static safety (only the service calls the functions, with only the allowed arguments; the browser never computes a balance or item count). |
| `npm run test:db` | 79 SQL assertions in `phase3_4a_jobs_shops.test.sql`. The verify script on fresh and used databases, plus 59 known-bad schema variants and 7 inconsistent data states. Re-apply and rollback refusal. Races: 8 parallel starts, 8 parallel claims, 8 parallel retries, stop-during-claim, 8 parallel overspending purchases and 8 parallel purchase retries. Mutation checks: each guard removed must be caught, including two lock mutants. The upgrade path from a 3.3A database holding a purchase, then the 3.4A rollback, the 3.3A refund rollback, and re-apply. Runs on Postgres 15.8 and 17.6. |
| `npm run test:api` | 11 HTTP tests in `scripts/api-test/shop-jobs.api.test.mjs`: auth, no character, refusals before the database, the shift lifecycle, paid once, 8 parallel claims over HTTP, shop prices, idempotent purchases, request-id reuse, parallel overspending, and the inventory and ledger agreeing. |

## 4. Manual test plan (only after the migration is applied, and not against production data)

Use two test accounts on a database that is **not** production.

1. 💼 → Jobs lists 3 jobs with the prices above. Start "Help at Iya Basira Buka": a 2:00 countdown appears, and Collect pay is disabled.
2. Try to start a second job (open a second tab): refused, "You are already working a shift".
3. Wait 2 minutes → Collect pay → cash +₦1,500. Click again quickly or reload and retry: no second payment.
4. Start a job and press "Stop (no pay)": no cash change. Collect pay now says there is no shift.
5. Buka → buy 2 zobo (₦800): cash −₦800, bag shows the new count. Buy items until cash is short: the button is disabled, and the server refuses with "not enough cash" if forced.
6. Turn the network off mid-purchase, then on → "Try again": charged once (check the ledger with the verify script).
7. Run `phase3_4a_economy_check.sql`: all `true`.

## 5. Evidence (local, 2026-10-23)

- `npm test`: 127/127. `npm run typecheck`, `npm run build`: pass.
- `npm run test:db`: passes on `supabase/postgres:15.8.1.085` and `17.6.1.003` (366 PASS lines each).
- `npm run test:api`: 25/25 (14 land + 11 jobs/shops).
- Browser, Chromium at 390 × 844, against a local build and stack:
  - started a shift, Collect pay was disabled while it ran, collected ₦1,500;
  - bought 2 zobo for ₦800, and the bag showed 2;
  - the database agreed (cash ₦50,700, 2 transactions);
  - no page errors.
