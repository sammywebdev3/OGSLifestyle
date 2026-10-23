-- UNDO for supabase/migrations/20261023000000_phase3_4a_jobs_shops.sql.
-- NOT a migration (it lives outside supabase/migrations, so no tool applies it).
--
-- Restores the exact Phase 3.3A schema: drops the 6 job/shop functions, the shift guard, the
-- 3 new tables and the columns/constraints 3.4A added, and puts back the original CHECKs.
-- After it, supabase/verify/phase3_3a_land_check.sql passes again (npm run test:db checks this).
--
-- It REFUSES (changing nothing) once any shift has been started or any job/shop money has moved:
-- wages are new money already in players' cash, and taking it back or deleting that history is
-- not something a rollback should do silently. After that point, fix forward instead.
--
-- Run it in the SQL Editor wrapped in:  begin;  <this file>  commit;
do $$
declare
  v_tx     bigint := (select count(*) from public.economy_transactions where kind <> 'land_purchase');
  v_req    bigint := (select count(*) from public.economic_requests where kind <> 'land_purchase');
  v_shifts bigint := (select count(*) from public.job_shifts);
begin
  if v_tx > 0 or v_req > 0 or v_shifts > 0 then
    raise exception 'Refusing to roll back Phase 3.4A: % job/shop transactions, % stored requests and % shifts exist. Fix forward instead.', v_tx, v_req, v_shifts;
  end if;
end;
$$;

drop function if exists public.buy_shop_item(text, integer, uuid);
drop function if exists public.get_shop(text);
drop function if exists public.get_my_jobs();
drop function if exists public.abandon_job_shift();
drop function if exists public.claim_job_shift(uuid);
drop function if exists public.start_job_shift(text);

alter table public.economic_requests
  drop constraint economic_requests_plot_check,
  drop constraint economic_requests_kind_check,
  add constraint economic_requests_kind_check check (kind in ('land_purchase')),
  alter column plot_id set not null;

alter table public.ledger_entries
  drop constraint ledger_entries_account_check,
  add constraint ledger_entries_account_check check (account in ('player', 'game:land-sales'));

drop index if exists public.economy_transactions_job_shift_idx;
alter table public.economy_transactions
  drop constraint economy_transactions_details_check,
  drop column quantity,
  drop column item_key,
  drop column job_shift_id,
  drop constraint economy_transactions_kind_check,
  add constraint economy_transactions_kind_check check (kind in ('land_purchase'));

drop table if exists public.job_shifts;
drop function if exists public.job_shifts_guard();
drop table if exists public.shop_items;
drop table if exists public.jobs;
