# Phase 3.3A: land ownership: plan, rollback and test plan

Signed-in players can buy one of **12 plots** on Kuto Street from the game:

| Tier | Price | Plots |
|---|---|---|
| Basic | ₦25,000 | 03, 07, 08, 09 |
| Standard | ₦50,000 | 01, 02, 10, 11, 12 |
| Premium | ₦100,000 | 04, 05, 06 |

Every plot is 2 × 2 tiles. Each plot has one owner, stored in the database.

**Status:** tested on throwaway local databases and a local build (section 5). It works on the live project only after
the migration has been applied there, and only once section 4 passes on the Vercel Preview.

**Not in this phase:** trading between players, building or construction, houses, companies, industries, and
automatic new plot releases.

## 1. How it works

| Piece | Details |
|---|---|
| **Registry** | `land_plots`: 12 seeded plots. Each has a key (`kuto-01` … `kuto-12`), a tier, a price, a tile footprint, and `owner_player_id`. The price is set by the migration. `null` means the game still owns it. |
| **Purchase** | `buy_land_plot(plot_key, idempotency_key)`, a SECURITY DEFINER function with an empty `search_path`. It takes **only** a plot key and a request id. The buyer comes from `auth.uid()` and the price from the registry. |
| **Atomic** | In one transaction it: locks the caller's `players` row, then the plot row (always in that order, so purchases cannot deadlock); checks the plot is unsold and the cash is enough; deducts the cash; sets the owner; writes one transaction with two ledger lines; stores the request id. |
| **Retries** | The same request id again returns the first result (`replayed: true`) and charges nothing. The same id for a different plot is refused. The browser reuses the id only when it could not tell whether the purchase went through. |
| **Errors** | `28000` not signed in, `OG403` no character, `22023` bad input, `OG404` no such plot, `OG409` already sold, `OG402` not enough cash, `OG422` request id reused. The API turns them into 401/403/400/404/409/402/409, plus a `code` the UI acts on. |
| **Reads** | `get_land_plots()` returns every plot's public facts: tier, price, footprint, the owner's **character name**, and `owned_by_me`. It returns no player ids, user ids, cash or history. `get_my_land()` returns only the caller's own plots and what they paid. |
| **Access** | RLS is on and there are no policies on `land_plots`, `economy_transactions`, `ledger_entries` or `economic_requests`. `anon` and `authenticated` hold no privileges on them. Only the three functions above are callable, and only by `authenticated`. |
| **History** | Transactions, ledger lines and stored requests cannot be updated or deleted (trigger, even for `postgres`). A deferred check refuses any transaction whose ledger lines do not sum to zero. |
| **API** | `GET /api/land` returns `{ plots, mine, cash }`. `POST /api/land/buy` takes `{ plotKey, requestId }` and nothing else: any other field, such as a price or player id, gets a 400. It is same-origin JSON only, at most 1 KB. Both routes use the player's own session, never the service-role key. |
| **UI** | 🗺️ button or **L** opens the plot list. Standing on a plot shows "View: Plot NN" (press **E**). The dialog asks for confirmation, then shows "Buying…" until the server answers. Ownership and the balance change **only** from the server's answer: nothing is optimistic. |
| **Map** | Plot footprints were placed only after checking `starterArea.ts`. Tests prove each plot is inside the map, on open ground, and clear of buildings, props, door approaches, interaction spots, the spawn point, tiles hidden behind buildings, and other plots. Map position is never used to authorize anything. |
| **Untouched** | `players`, `inventories`, `inventory_items`, their policies, `create_character`, and the multiplayer functions and policies are unchanged. `npm run test:db` checks this. |

### How existing cash relates to the ledger

The ledger starts with this migration.

- **Pre-ledger cash.** Cash that already exists has no ledger line, and is treated as *pre-ledger* money. That
  includes every player's ₦50,000 starting cash from `create_character`, which is unchanged and is still not
  ledgered.
- **Every change from now on is recorded.** Each cash change writes a `player` line with the signed amount and the
  player's balance right after it (`balance_after`). The game's side of a land purchase is a `game:land-sales` line.
- **Invariants:**
  - For each player: `players.cash` = pre-ledger cash + the sum of their ledger lines. Pre-ledger cash is the first
    line's `balance_after − amount`.
  - The latest `balance_after` equals `players.cash`.
  - Across the game: sum of all `players.cash` + sum of `game:land-sales` = total pre-ledger cash. Money spent on land
    leaves circulation and is recorded.
  - The lines of every transaction sum to 0.
- **Not yet covered:** starting cash given to *new* characters is still not ledgered. Making it ledgered would mean
  changing `create_character`, which was deliberately left alone. It is a candidate for a later, reviewed migration.

## 2. Migration and rollback

**Migration:** `supabase/migrations/20261020000000_phase3_3a_land.sql`

- It is additive: 4 new tables, 5 functions (3 callable, 2 for triggers), 4 triggers, and the 12 seeded plots.
- It uses plain `create` statements, so if anything already exists the whole migration fails and changes nothing.

**Applying it to the live project is NOT done and needs separate approval.** When approved:

1. **Back up first.** Supabase → Database → Backups. Also note `select count(*), sum(cash) from public.players;`.
2. **Apply.** In the SQL Editor, type `begin;`, paste the **whole** migration file, then type `commit;` and Run.
3. **Check.** These should give: 12 plots, all unowned; 0 transactions; and the same player count and cash total as
   in step 1.

   ```sql
   select count(*), count(owner_player_id) from public.land_plots;
   select count(*) from public.economy_transactions;
   select count(*), sum(cash) from public.players;
   ```

4. **Run the read-only verification script** `supabase/verify/phase3_3a_land_check.sql` (section 2a).
5. **Regenerate the database types** from the live project (see README → Database types). Run `npm run typecheck`.

### 2a. Read-only verification script

`supabase/verify/phase3_3a_land_check.sql` confirms that a database matches the reviewed migration. It only reads system
catalogs and counts rows. It returns no player ids, user ids, names or balances.

**How to run it safely:** Supabase → SQL Editor → a new, empty query. Paste exactly this, then **Run**:

```sql
begin transaction read only;
-- paste the whole of supabase/verify/phase3_3a_land_check.sql here
rollback;
```

In a read-only transaction, any write would fail, so nothing can change.

**Expected result:** every row has `ok = true`, and the first row, `00 ALL CHECKS`, is `true`.

| Rows | What they check |
|---|---|
| 01–05 | The 4 land tables exist. RLS is on and not forced. There are no policies on them. `anon`, `authenticated` and PUBLIC have no table privileges and cannot use the ledger sequence. |
| 06–08 | Columns, types, defaults and constraints match the reviewed migration (fingerprints). The 3 append-only triggers and the deferred balance check are present and enabled. |
| 09–12 | The 5 functions exist with the reviewed signatures, with exactly one `buy_land_plot(text, uuid)` returning `jsonb`. Their SECURITY DEFINER flags, empty `search_path` and `postgres` owner match. Only the 3 land functions are callable, by `authenticated` only. Each function body matches the reviewed version: a re-indented body (which the SQL Editor may produce) is reported as "same code". |
| 13–14 | Exactly the 12 seeded plots, with their keys, tiers, footprints and prices (₦25,000 / ₦50,000 / ₦100,000). |
| 15–18 | Ownership and money are consistent: a plot is owned exactly when it has one purchase by its owner. Every transaction has 2 ledger lines summing to 0. Each player's latest ledger balance equals their cash. No cash is negative. Stored requests match their transactions. |
| 19–21 | Phase 1 is untouched: same policy fingerprint as the Phase 1 live check, `authenticated` has SELECT only, and there are no triggers on players or inventories. Exactly the 6 reviewed functions are callable, and `anon` can call none. |
| i1 | Information, not a check. It must say **yes** right after the migration is applied (no plot owned, empty ledger), and **no** once players have bought land. Both are healthy. |

**If something fails:**

- An error such as `relation "public.land_plots" does not exist` means the migration is not applied to this database.
- Any `false` row means the database differs from the reviewed migration. **Stop and report the row and its detail**;
  do not continue testing.
- Check 15 assumes there is no trading between players (true in Phase 3.3A). It must be revised when trading arrives.

`npm run test:db` checks that the script:

- passes, inside a READ ONLY transaction, on a freshly migrated database (on Postgres 15.8 and 17.6);
- passes after real purchases, and its output contains no ids or names;
- accepts a re-indented function body;
- fails on 28 known-bad structural changes and 4 inconsistent ownership/ledger states.

**Rollback:** `supabase/rollback/20261020000000_phase3_3a_land_down.sql`. It is not a migration.

- **No purchases yet:** it simply removes the land objects. Nothing else is touched.
- **After purchases:** it **refuses** to run, and changes nothing.
- **To refund and roll back anyway:** run `set ogs.rollback_refund = 'yes';` in the same session first. Every player
  then gets back exactly what their ledger lines took (their cash returns to its pre-ledger value). Then the land is
  removed.
- Always run it wrapped in `begin; … commit;`.
- `npm run test:db` checks all three paths.
- After real purchases, prefer a fix-forward migration to a rollback.

### Account deletion

**The app has no account-deletion flow.** Accounts can only be deleted by an admin, either in Supabase →
Authentication → Users, or through the Auth admin API. Nothing in the app calls either.

Since this migration, land and ledger rows reference `players` with `on delete restrict`.

**For a player who owns land** (or has ledger history), deleting the account is **refused by the database**:

- Nothing is removed. The land is not confiscated or transferred, and the ledger is kept.
- Supabase shows only a generic "Database error deleting user". The SQL Editor shows the exact cause, for example:
  `violates foreign key constraint "land_plots_owner_player_id_fkey" on table "land_plots"`.

**For a player without land, or a user without a character,** deletion works as before: the player, inventory and
items are removed.

**Before deleting any account,** run the read-only pre-check `supabase/verify/account_deletion_precheck.sql`:

1. Put the user's UID in its `target` line.
2. In the SQL Editor, run it wrapped in `begin transaction read only; … rollback;`.
3. Read the result. It returns `deletable` and a plain `advice` message.
   - `deletable = true`: deletion is safe, as above.
   - `deletable = false`, with advice "BLOCKED: this player owns N plot(s) of land …": do not delete the account. Do
     not drop or bypass the foreign keys, edit `land_plots` or delete ledger rows.

**Resolving land ownership** needs a reviewed, approved fix-forward migration. Phase 3.3A has no tool for it on
purpose.

**Tests:**

- `npm run test:db` §43 and the pre-check section cover both cases: refused for a land owner with nothing removed;
  allowed with and without a character.
- `npm run test:api` deletes users through the real Auth admin API: refused for a land owner, who can still play
  afterwards; allowed for a player without land, whose old session then stops working.

## 3. Before you test on the Preview

- The Vercel Preview uses the **live** Supabase project.
- **Without the migration:** the game works as before, and the 🗺️ panel says **"Land is not open on this server
  yet"**.
- **With the migration (after approval, section 2):** you need two accounts with characters (A and B), in two
  separate browser sessions.

## 4. Manual Preview test (after the migration is applied)

| # | Step | Expected |
|---|---|---|
| 1 | A opens **/play** and taps 🗺️ (or presses **L**). | 12 plots, all **For sale**. "You do not own any land yet." |
| 2 | A opens **Plot 07** and taps **Buy for ₦25,000**. | A **Confirm: pay ₦25,000** step. The cash is still ₦50,000. |
| 3 | A confirms. | "Buying…", then "You now own Plot 07. Your new balance is ₦25,000." The HUD shows ₦25,000. The map label reads **07 · YOURS**. |
| 4 | A reloads the page. | Still ₦25,000. Plot 07 is still **Yours**. |
| 5 | B opens 🗺️. | Plot 07 shows **Owned by \<A's name\>**. Opening it shows no Buy button. |
| 6 | B buys **Plot 01** (₦50,000). | B's HUD shows ₦0. |
| 7 | B opens **Plot 09**. | **Buy** is disabled, with "You need ₦25,000 more". |
| 8 | Two other new accounts (C and D, ₦50,000 each) open **Plot 10** and confirm at the same moment. | Exactly one gets it. The other sees "Someone else bought this plot first. You were not charged." Their cash is unchanged. |
| 9 | A (₦25,000) opens **Plot 08** and confirms. A turns on airplane mode just before confirming, then turns it off and taps **Try again**. | Either it completes once, or "Your purchase went through… You were charged once". Never two charges. A ends with ₦0. |
| 10 | Walk A onto any plot. | "View: Plot NN" appears. Pressing **E** opens the dialog. |
| 11 | In B's browser console: `fetch('/api/land/buy',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({plotKey:'kuto-09',requestId:crypto.randomUUID(),price:1})}).then(r=>r.status)` | `400`. Without `price` it gives `402` (not enough cash). |
| 12 | A guest session opens 🗺️. | "Guest preview" notice. Plots show "Sign in to see". There is no Buy button. |
| 13 | Chat, emotes and movement between A and B. | Work as in Phase 3.2. |
| 14 | In the SQL Editor: `select sum(amount) from public.ledger_entries;` and `select count(*) from public.players where cash < 0;` | `0` and `0`. |

## 5. What was verified, and how

| Claim | How | Real Supabase project? |
|---|---|---|
| Structure, RLS, grants, function security; existing policies unchanged (same fingerprint as the Phase 1 live check) | `npm run test:db` §30–31, Postgres 15.8 and 17.6 | No (official Supabase images) |
| 12 plots, approved prices, inside the map, no overlaps | §32, plus `plots.test.ts` (parses the migration seed) | No |
| Anon, no-character and direct table access refused; no price or player id overloads | §33–36 | No |
| Purchase, deduction, ledger lines, retries, sold, not enough cash, other player's view | §37–39 | No |
| Append-only history; unbalanced transactions refused; money conserved; ledger matches cash | §40–41, and after the races | No |
| Races: 8 buyers for one plot, 8 parallel retries, overlapping retry, parallel overspending | `test-db.sh` concurrency section (separate connections) | No |
| Mutation checks: idempotency lookup, sold checks, balance checks, plot lock, player lock removed → caught | `test-db.sh` mutation section | No |
| Fail-safe re-apply; rollback refuses, and the refund path restores cash | `test-db.sh` | No |
| Request parsing, same origin, body limits, no extra fields, retry ids, mapping, static safety | `npm test` (`src/features/land/*.test.ts`). Ten app-side protections were also mutation-checked by hand. | n/a |
| Full flow in a browser: buy, confirm, server balance, lost response, retry with the same id, other player, insufficient cash, tampering, cross-site, reload, on-plot prompt, guest | Local production build against throwaway GoTrue + PostgREST + Supabase Postgres containers (Playwright, 26/26 checks) | **No** |
| The real API routes over HTTP: unauthenticated, no character, bad/oversized/cross-origin bodies, injected fields, purchase, insufficient funds, sold, retries (incl. 5 parallel), cross-player isolation, 500/503 database errors, account deletion via the Auth admin API | `npm run test:api`: production build + local GoTrue, PostgREST and Supabase Postgres; mutation-checked (allowing extra fields makes 8 of 14 tests fail) | **No** (local stand-ins) |
| Two real accounts on the Preview with the live project | Section 4 | **Not yet** (needs the migration applied, with approval) |
