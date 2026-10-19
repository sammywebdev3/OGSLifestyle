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

### Accepted exposure: profile lookup is not limited to your current room

`get_player_profiles` returns the **name and avatar** of any player whose id the caller already knows, even if that
player has left the room. This is accepted, not fixed, for these reasons:

- **Learning an id is limited.** A player's id reaches other browsers only as a presence key, while that player is in a
  room you can join, and they can already see that player's name and avatar there. RLS hides every other player's row,
  and the 122-bit random ids can't be guessed. `npm run test:db` checks 1,000 guesses, the absence of any other function
  or view that returns ids, and the absence of pattern lookups.
- **What it reveals is limited.** Only the in-game display name and avatar. Never the user id, email, cash, location or
  inventory.
- **The database can't check room membership.** Presence lives only in the Realtime server, not in Postgres. Enforcing it
  would need a new table written by heartbeats from every player (persistent writes this design avoids).
- **That check would also break joining.** A newcomer's profile is requested as soon as they appear, often before their
  first heartbeat row exists. The client never re-asks for an id that came back empty, so they would stay invisible.
- **It still wouldn't be a real boundary.** Any player with a character may join any room, so it would only hide players
  who were seen earlier and are now offline.

Revisit this if a future feature makes names sensitive, or exposes player ids outside rooms (for example leaderboards).

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

   If anything fails, nothing is applied. The migration never replaces or drops anything: if one of its objects
   already exists, it fails and rolls back. **Do not run it a second time** if it succeeded.
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

### Undo (only if needed)

Run `supabase/rollback/20261019000000_phase3_1_multiplayer_down.sql` in a new query, wrapped in `begin;` … `commit;`.
- It removes only the 3 `mp:` policies and the 2 functions.
- No table or player data is touched.
- The game keeps working; multiplayer just shows "Multiplayer offline".
- `npm run test:db` checks this on a throwaway database.

### 2b. Realtime settings

Supabase → **Realtime → Settings**.

- **Recommended: turn off "Allow public access"**, so only private channels (with the policies above) can be used. This
  game uses no public channels.
  - My understanding of the Realtime server is that public and private channels with the same name are kept apart, so
    this is extra protection, not a requirement.
  - I haven't checked that against a live project.
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

## 4. What has and has not been verified

| Claim | How it was checked | Real Supabase server? |
|---|---|---|
| Policy rules: only the owner can send on their topic; no character means no access; anon is refused | `npm run test:db`, against a stand-in `realtime.messages` table and `realtime.topic()` (`supabase/tests/setup/realtime_stub.sql`) on the official Supabase Postgres image | **No.** Join checks are emulated the way Realtime performs them (insert/select under the user's role with `realtime.topic` set). |
| Client behaviour: join, leave, reconnect, two tabs, impersonation attempt, denial | `npm test`, client against an in-memory hub that applies the same rules | **No** |
| Remote characters render, glide and disappear in Phaser | Browser check with injected events | **No** (no network) |
| Migration fails safely, rollback removes only its objects | `npm run test:db` | Postgres only, **not the hosted project** |
| Realtime enforces the policies for private channels, and private and public channels are separate | Supabase's documented behaviour | **Not yet.** Steps 2 to 8 of section 3 are the first real check. |

## 5. Automated checks (already run for this branch)

- `npm test`: protocol validation, roster join/leave/duplicates/reconnect, movement timing, and the client wired to an
  in-memory Realtime stand-in. The stand-in applies the policy rules; it's not the real server.
- `npm run test:db`: the migration's grants, functions and the Realtime policies, using Supabase's `realtime.messages`
  rules emulated in a throwaway database. Covers anon, a user without a character, own-topic vs other-topic broadcast,
  and malformed topics.
