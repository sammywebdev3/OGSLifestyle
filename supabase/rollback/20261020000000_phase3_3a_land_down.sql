-- UNDO for supabase/migrations/20261020000000_phase3_3a_land.sql.
-- NOT a migration (it lives outside supabase/migrations, so no tool applies it).
--
-- Removes ONLY the objects that migration added: the 3 land functions, the 4
-- economy tables (with their triggers) and the 2 trigger functions. Players,
-- inventories, their policies, create_character and the multiplayer objects stay.
--
-- Land that has been bought is real game state. So by default this script REFUSES
-- to run once any purchase exists (nothing is changed). To roll back anyway, the
-- operator must say so explicitly, in the same session, before running it:
--
--     set ogs.rollback_refund = 'yes';
--
-- Then, before dropping anything, every player gets back exactly what the ledger
-- says they spent (minus the sum of their 'player' lines), so their cash returns
-- to its pre-ledger value, and the land is released with the tables.
-- Prefer a fix-forward migration over this whenever possible.
--
-- Run it in the SQL Editor wrapped in:  begin;  <this file>  commit;
-- npm run test:db checks both paths on a throwaway database.
do $$
declare
  v_lines bigint := (select count(*) from public.ledger_entries);
  v_owned bigint := (select count(*) from public.land_plots where owner_player_id is not null);
begin
  if v_lines = 0 and v_owned = 0 then
    return;
  end if;
  if coalesce(current_setting('ogs.rollback_refund', true), '') <> 'yes' then
    raise exception 'Refusing to roll back: % ledger lines and % owned plots exist. Set ogs.rollback_refund = ''yes'' to refund and roll back.', v_lines, v_owned;
  end if;
  update public.players p set cash = p.cash + r.refund
    from (select player_id, -sum(amount) as refund from public.ledger_entries
           where account = 'player' group by player_id) r
   where p.id = r.player_id and r.refund <> 0;
  raise notice 'Refunded % players before rolling back', (select count(distinct player_id) from public.ledger_entries where account = 'player');
end;
$$;

drop function if exists public.get_my_land();
drop function if exists public.get_land_plots();
drop function if exists public.buy_land_plot(text, uuid);
drop table if exists public.economic_requests;
drop table if exists public.ledger_entries;
drop table if exists public.economy_transactions;
drop table if exists public.land_plots;
drop function if exists public.ledger_check_balanced();
drop function if exists public.economy_append_only();
