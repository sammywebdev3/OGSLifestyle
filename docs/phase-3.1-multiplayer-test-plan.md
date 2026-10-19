# Phase 3.1 multiplayer: setup and test plan

Two signed-in players in **Kuto Street** see each other's characters and movement in real time.

**Status of this plan:**
- Not yet run against the live Supabase project.
- Two-account multiplayer counts as working only once every step in section 3 passes with two real accounts in
  two separate browser sessions.

## 1. How it works (short)

| Piece | What it does |
|---|---|
| Private Realtime channel `mp:kuto-street` | **Presence only**: who is in the room. |
| Private channel `mp:kuto-street:<player id>` | That player's movement. Database policies let **only the owner** of `<player id>` send on it, so a message there is known to come from that player. |
| `get_player_profiles(uuid[])` | Gives other players' **name and avatar** (nothing else) from the database. Names are never taken from other clients. |
| Movement messages | Sent about 10 times a second while moving, and every 2 s while standing still. **Never written to the database.** |

- **Guests** play solo. Nobody sees them and they see nobody.
- **If Realtime fails,** the game keeps running solo and the HUD shows the state.

## 2. One-time setup (needs your explicit approval; changes the live project)

### 2a. Apply the migration (Supabase → SQL Editor → new, empty query)

The migration file is `supabase/migrations/20261019000000_phase3_1_multiplayer.sql`.

1. **Pre-check (read-only).** Expected result: `realtime.messages` exists, then `NULL`, `NULL`, `0`.
   ```sql
   select to_regclass('realtime.messages') as realtime_table,
          to_regprocedure('public.get_player_profiles(uuid[])') as profiles_fn,
          to_regprocedure('public.mp_my_player_id()') as my_id_fn,
          (select count(*) from pg_policies where schemaname = 'realtime' and policyname like 'mp:%') as mp_policies;
   ```
   If `realtime_table` is `NULL`, stop and report. Realtime isn't set up on the project.
2. **Apply.**
   - Type `begin;` on the first line.
   - Paste the whole migration file below it.
   - Put `commit;` on the last line.
   - Run.

   If anything fails, nothing is applied. **Do not run it a second time** if it succeeded.
3. **Verify (read-only).** Expected result:
   - Two functions: `get_player_profiles` with `true` and `{search_path=""}`; `mp_my_player_id` with `false` and `{search_path=""}`.
   - Three `mp:` policies on `realtime.messages`, all for `{authenticated}`.
   ```sql
   select proname, prosecdef, proconfig from pg_proc
    where oid in (to_regprocedure('public.get_player_profiles(uuid[])'), to_regprocedure('public.mp_my_player_id()'));
   select policyname, cmd, roles from pg_policies
    where schemaname = 'realtime' and tablename = 'messages' and policyname like 'mp:%' order by 1;
   ```
4. Re-run `supabase/verify/phase1_live_check.sql`. All Phase 1 checks should still be `true`; this migration doesn't touch
   them.

### 2b. Realtime settings

Supabase → **Realtime → Settings**.

- **Recommended: turn off "Allow public access"**, so only private channels (with the policies above) can be used. This
  game uses no public channels.
- Leave the other settings at their defaults.

## 3. Two-account test

**You need:**
- Two accounts with characters: A and B.
- Two separate browser sessions. Use two devices, or a normal window plus an incognito window. Two tabs in the same
  window share one login, so they don't count.
- A third browser session for the guest check.

Test on the Vercel **Preview** of this branch, or on production after a merge. Both use the live Supabase project, so
2a must be done first.

| # | Step | Expected |
|---|---|---|
| 1 | Session 1: sign in as A, open **/play**. | The HUD shows **Connecting…**, then **Online · 0 nearby**. |
| 2 | Session 2: sign in as B, open **/play**. | Within about 2 s, both HUDs show **Online · 1 nearby**. Each sees the other's character with the correct **name and outfit**, and a **green** name tag. Your own tag stays blue. |
| 3 | Move A around with the arrows or touch pad. | In session 2, A walks smoothly, without jumping between steps, and faces the direction they walk. |
| 4 | Move both at once. | Each player controls only their own character. Remote movement never moves you. |
| 5 | Walk A into a building corner. | A slides along the wall as before. Collision is unchanged. |
| 6 | Reload A's page. | In session 2, A disappears briefly and comes back **once**. Never two A characters. |
| 7 | Open a second tab for B in session 2 and move there. | Session 1 still shows **one** B character. |
| 8 | Close A's tab. | In session 2, A disappears within a few seconds, and the HUD shows **0 nearby**. |
| 9 | Session 1: put the device offline (airplane mode) for 20 s, then reconnect. | Session 1 shows **Reconnecting…**, then **Online**. Session 2 hides A after about 10 s, and shows A again after the reconnect. |
| 10 | Session 3: play as a **guest**. | The HUD shows **Solo · guest**. A and B don't see the guest, and the guest doesn't see them. |
| 11 | Open a dialog (E at a door) or the bag (I) while the other player moves. | Remote players keep moving. The game doesn't crash. |
| 12 | Check A's cash and inventory after all of the above. | Unchanged: **₦50,000** and the 3 starter items. Multiplayer saves nothing. |

**If the HUD shows "Multiplayer offline":** the private channel was refused. Check that 2a was applied and that both
accounts have a character. The rest of the game should still work solo.

## 4. Automated checks (already run for this branch)

- `npm test`: protocol validation, roster join/leave/duplicates/reconnect, movement timing, and the client wired to an
  in-memory Realtime stand-in. The stand-in applies the policy rules; it's not the real server.
- `npm run test:db`: the migration's grants, functions and the Realtime policies, using Supabase's `realtime.messages`
  rules emulated in a throwaway database. Covers anon, a user without a character, own-topic vs other-topic broadcast,
  and malformed topics.
