-- READ-ONLY pre-check before deleting a user account (Supabase -> Authentication -> Users -> Delete,
-- or the Auth admin API). The app itself has NO account-deletion flow.
--
-- Why: since Phase 3.3A, land ownership and the transaction ledger (and, since Phase 3.4A, work
-- shifts) reference public.players with ON DELETE RESTRICT. Deleting the auth user of a player who owns land (or has ledger history) is
-- REFUSED by the database, so nothing is deleted silently. The dashboard then only shows a generic
-- "Database error deleting user". This script tells you why, before you try.
--
-- How: put the user's id (Authentication -> Users -> the user's UID) in the `target` line below,
-- then in Supabase -> SQL Editor run:
--
--     begin transaction read only;
--     <this file, with the id filled in>
--     rollback;
--
-- It only reads and returns counts for that one user (no names, balances or other players).
--
-- Result "deletable = true": deleting the account removes the player, inventory and items (as
-- before Phase 3.3A). "deletable = false": do NOT delete, and do NOT drop or bypass the foreign
-- keys, edit land_plots or delete ledger rows. Land ownership must be resolved first, and Phase
-- 3.3A has no supported way to do that: it needs a reviewed, approved fix-forward migration
-- (see docs/phase-3.3a-land-test-plan.md, "Account deletion").
with
target(user_id) as (values ('00000000-0000-0000-0000-000000000000'::uuid)),  -- <-- the user's UID
p as (select pl.id from public.players pl join target t on t.user_id = pl.user_id),
counts as (
  select
    exists (select 1 from auth.users u join target t on t.user_id = u.id)                                    as user_exists,
    exists (select 1 from p)                                                                                  as has_character,
    (select count(*) from public.land_plots l where l.owner_player_id in (select id from p))                 as plots_owned,
    (select count(*) from public.economy_transactions x where x.player_id in (select id from p))             as transactions,
    (select count(*) from public.ledger_entries e where e.player_id in (select id from p))                   as ledger_lines,
    (select count(*) from public.economic_requests r where r.player_id in (select id from p))                as stored_requests,
    -- job_shifts exists only from Phase 3.4A on (also ON DELETE RESTRICT). It is counted through
    -- query_to_xml so this file still runs, unchanged, on a database without that table.
    case when to_regclass('public.job_shifts') is null then 0
         else (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from public.job_shifts s join public.players pl on pl.id = s.player_id where pl.user_id = %L',
                                                          (select user_id from target)), false, true, '')))[1]::text::bigint
    end                                                                                                       as job_shifts
)
select user_exists, has_character, plots_owned, transactions, ledger_lines, stored_requests, job_shifts,
       user_exists and plots_owned = 0 and transactions = 0 and ledger_lines = 0 and stored_requests = 0 and job_shifts = 0 as deletable,
       case
         when not user_exists then 'No such user: check the UID.'
         when plots_owned > 0 then 'BLOCKED: this player owns ' || plots_owned || ' plot(s) of land. The database refuses to delete the account '
           || '(foreign key land_plots_owner_player_id_fkey). Resolve the land ownership first through a reviewed, approved migration; '
           || 'do not drop constraints or edit land or ledger rows.'
         when transactions + ledger_lines + stored_requests > 0 then 'BLOCKED: this player has transaction history (' || ledger_lines
           || ' ledger lines). Financial history is kept, so the database refuses to delete the account. Needs a reviewed, approved decision.'
         when job_shifts > 0 then 'BLOCKED: this player has ' || job_shifts || ' work shift(s) on record (foreign key job_shifts_player_id_fkey). '
           || 'Shift history is kept, so the database refuses to delete the account. Needs a reviewed, approved decision.'
         else 'OK: no land and no transaction history. Deleting the account removes the player, inventory and items.'
       end as advice
from counts;
