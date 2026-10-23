-- Database tests for supabase/migrations/20261023000000_phase3_4a_jobs_shops.sql
--
-- Runs after the earlier test files in the same DISPOSABLE database and reuses their tests.*
-- helpers. Uses its own players (W = worker, S = shopper, P = poor) so earlier fixtures are
-- untouched. Concurrency and mutation checks live in scripts/test-db.sh.
-- NEVER run against a real project.

\set ON_ERROR_STOP 1
\set QUIET 1

\set W '00000000-0000-4000-c000-0000000000a1'
\set S '00000000-0000-4000-c000-0000000000a2'
\set P '00000000-0000-4000-c000-0000000000a3'
\set N '00000000-0000-4000-c000-0000000000a4'

-- Test-only: make a player's working shift look finished (the guard trigger forbids this in real use).
create or replace function tests.finish_shift_now(uid uuid) returns void language plpgsql as $$
begin
  alter table public.job_shifts disable trigger job_shifts_guard;
  update public.job_shifts s set started_at = now() - interval '1 hour', ends_at = now() - interval '1 second'
    from public.players p where p.id = s.player_id and p.user_id = uid and s.status = 'working';
  alter table public.job_shifts enable trigger job_shifts_guard;
end $$;

insert into auth.users (id, email) values (:'W', 'worker@test.local'), (:'S', 'shopper@test.local'), (:'P', 'poor@test.local'), (:'N', 'nochar@test.local');
set role authenticated;
select tests.claims(:'W'); select public.create_character('Wale Worker', '{"body":"masc","skin":"deep","headwear":"cap","outfit":"ogun"}') is not null;
select tests.claims(:'S'); select public.create_character('Sade Shopper', '{"body":"femme","skin":"warm","headwear":"gele","outfit":"adire"}') is not null;
select tests.claims(:'P'); select public.create_character('Pele Poor', '{"body":"masc","skin":"brown","headwear":"none","outfit":"ink"}') is not null;
reset role;
-- P starts with only ₦100 (test fixture, set before any ledger activity, so it is pre-ledger money).
update public.players set cash = 100 where user_id = :'P';
-- Total cash before this file (pre-ledger money of every player + all game lines so far).
select (select sum(cash) from public.players) + (select coalesce(sum(amount), 0) from public.ledger_entries where account <> 'player') as money_before \gset

\echo '== 50. Jobs and shops: structure, RLS, grants and function security'
select tests.ok((select count(*) = 3 and bool_and(relrowsecurity and not relforcerowsecurity) from pg_class
                 where oid in ('public.jobs'::regclass, 'public.job_shifts'::regclass, 'public.shop_items'::regclass)),
                'RLS on (not forced) for jobs, job_shifts, shop_items');
select tests.ok((select count(*) = 0 from pg_policies where schemaname = 'public' and tablename in ('jobs', 'job_shifts', 'shop_items')),
                'no policies on the new tables (clients cannot read or write them)');
select tests.ok(not exists (
  select 1 from (values ('anon'), ('authenticated'), ('public')) r(role),
       (values ('public.jobs'), ('public.job_shifts'), ('public.shop_items')) t(tbl),
       (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')) p(priv)
  where has_table_privilege(r.role, t.tbl, p.priv)), 'client roles hold no privilege on jobs, job_shifts, shop_items');
select tests.ok((select bool_and(prosecdef and proconfig = array['search_path=""'] and pg_get_userbyid(proowner) = 'postgres'
                   and has_function_privilege('authenticated', oid, 'execute') and not has_function_privilege('anon', oid, 'execute')
                   and not exists (select 1 from aclexplode(proacl) a where a.grantee = 0))
                 from pg_proc where oid in ('public.start_job_shift(text)'::regprocedure, 'public.claim_job_shift(uuid)'::regprocedure,
                   'public.abandon_job_shift()'::regprocedure, 'public.get_my_jobs()'::regprocedure, 'public.get_shop(text)'::regprocedure,
                   'public.buy_shop_item(text, integer, uuid)'::regprocedure)),
                'the 6 new functions: SECURITY DEFINER, empty search_path, owned by postgres, EXECUTE for authenticated only');
select tests.ok(not has_function_privilege('authenticated', 'public.job_shifts_guard()', 'execute')
                and (select proconfig = array['search_path=""'] from pg_proc where oid = 'public.job_shifts_guard()'::regprocedure),
                'the shift guard trigger function is not callable by clients and has an empty search_path');
select tests.ok((select count(*) = 1 from pg_proc where proname = 'buy_shop_item' and pronamespace = 'public'::regnamespace)
                and (select count(*) = 1 from pg_proc where proname = 'claim_job_shift' and pronamespace = 'public'::regnamespace),
                'one buy_shop_item and one claim_job_shift: no overload that takes a price, pay, cash or player id');
select tests.ok((select count(*) = 3 from public.jobs) and (select count(*) = 6 from public.shop_items), '3 seeded jobs and 6 shop items');

\echo '== 51. The widened economy accepts the new kinds only with their own details (as postgres)'
select tests.ok((select bool_and(kind = 'land_purchase' and plot_id is not null) from public.economy_transactions),
                'every existing transaction is a land purchase and still valid under the widened rules');
do $$
declare v_p uuid := (select id from public.players order by id limit 1);
begin
  begin
    insert into public.economy_transactions (kind, player_id, amount) values ('job_payout', v_p, 100);
    raise exception 'FAIL: a job payout without a shift was accepted';
  exception when check_violation then raise notice 'PASS: a job payout must name its shift';
  end;
  begin
    insert into public.economy_transactions (kind, player_id, amount, item_key) values ('shop_purchase', v_p, 100, 'zobo');
    raise exception 'FAIL: a shop purchase without a quantity was accepted';
  exception when check_violation then raise notice 'PASS: a shop purchase must name item and quantity';
  end;
  begin
    insert into public.economy_transactions (kind, player_id, amount) values ('gift', v_p, 100);
    raise exception 'FAIL: an unknown kind was accepted';
  exception when check_violation then raise notice 'PASS: unknown transaction kinds are refused';
  end;
  begin
    insert into public.ledger_entries (transaction_id, account, amount) values (gen_random_uuid(), 'game:printing-press', 1);
    raise exception 'FAIL: an unknown ledger account was accepted';
  exception when check_violation or foreign_key_violation then raise notice 'PASS: unknown ledger accounts are refused';
  end;
end $$;

\echo '== 52. Anonymous visitors and players without a character'
set role anon;
select tests.claims(null);
select tests.expect_error($$select public.start_job_shift('buka-helper')$$, '42501', 'anon cannot start a shift');
select tests.expect_error($$select public.claim_job_shift(gen_random_uuid())$$, '42501', 'anon cannot claim pay');
select tests.expect_error($$select public.buy_shop_item('zobo', 1, gen_random_uuid())$$, '42501', 'anon cannot buy');
select tests.expect_error($$select public.get_shop('buka')$$, '42501', 'anon cannot see shops');
reset role;
set role authenticated;
select tests.claims(:'N');
select tests.expect_error($$select public.start_job_shift('buka-helper')$$, 'OG403', 'no character: cannot work');
select tests.expect_error($$select public.claim_job_shift(gen_random_uuid())$$, 'OG403', 'no character: cannot claim');
select tests.expect_error($$select public.buy_shop_item('zobo', 1, gen_random_uuid())$$, 'OG403', 'no character: cannot buy');
select tests.expect_error($$select public.get_my_jobs()$$, '28000', 'no character: no job list');
select tests.expect_error($$select public.get_shop('buka')$$, '28000', 'no character: no shop');
select tests.claims(:'W');
select tests.expect_error($$select * from public.jobs$$, '42501', 'W cannot read jobs directly');
select tests.expect_error($$select * from public.job_shifts$$, '42501', 'W cannot read shifts directly');
select tests.expect_error($$insert into public.job_shifts (player_id, job_key, pay, ends_at) select id, 'okada-rider', 100000, now() from public.players$$, '42501', 'W cannot insert a shift');
select tests.expect_error($$update public.shop_items set price = 10$$, '42501', 'W cannot change prices');
select tests.expect_error($$update public.players set cash = cash + 100000$$, '42501', 'W still cannot change cash');
reset role;

\echo '== 53. Working a shift (as W)'
set role authenticated;
select tests.claims(:'W');
select tests.ok((select jsonb_array_length(public.get_my_jobs() -> 'jobs') = 3 and public.get_my_jobs() -> 'active' = 'null'::jsonb
                   and (public.get_my_jobs() ->> 'shifts_today')::int = 0), 'W sees 3 jobs, no active shift, 0 shifts today');
select tests.expect_error($$select public.start_job_shift('Buka Helper')$$, '22023', 'malformed job key rejected');
select tests.expect_error($$select public.start_job_shift(null)$$, '22023', 'null job key rejected');
select tests.expect_error($$select public.start_job_shift('ceo-of-everything')$$, 'OG404', 'unknown job rejected');
create temp table w_start as select public.start_job_shift('buka-helper') as r;
grant select on w_start to authenticated;
select tests.ok((select (r ->> 'pay')::bigint = 1500 and (r ->> 'ends_at')::timestamptz - (r ->> 'started_at')::timestamptz = interval '120 seconds' from w_start),
                'shift started: pay ₦1,500 fixed by the server, 120 s long');
select tests.expect_error($$select public.start_job_shift('okada-rider')$$, 'OG409', 'a second shift while working is refused');
select tests.expect_error($$select public.claim_job_shift(gen_random_uuid())$$, 'OG425', 'claiming before the shift ends is refused');
select tests.expect_error($$select public.claim_job_shift(null)$$, '22023', 'claim without a request id is refused');
select tests.ok((select cash = 50000 from public.players), 'nothing paid yet');
reset role;

\echo '== 54. Getting paid, once (as W)'
select tests.finish_shift_now(:'W');
set role authenticated;
select tests.claims(:'W');
create temp table w_claim as select public.claim_job_shift('33333333-3333-4333-8333-333333333333') as r;
select tests.ok((select (r ->> 'pay')::bigint = 1500 and (r ->> 'cash')::bigint = 51500 and not (r ->> 'replayed')::boolean from w_claim),
                'claim pays ₦1,500: balance ₦51,500');
select tests.ok((select cash = 51500 from public.players), 'W''s cash in the database is ₦51,500');
select tests.ok((select (r ->> 'replayed')::boolean and (r ->> 'cash')::bigint = 51500
                 from (select public.claim_job_shift('33333333-3333-4333-8333-333333333333') as r) s), 'same request again: replayed, not paid twice');
select tests.expect_error($$select public.claim_job_shift(gen_random_uuid())$$, 'OG404', 'a new request after being paid finds no shift to claim');
select tests.expect_error($$select public.buy_shop_item('zobo', 1, '33333333-3333-4333-8333-333333333333')$$, 'OG422', 'the claim''s request id cannot be reused for a purchase');
select tests.ok((select cash = 51500 from public.players), 'still ₦51,500');
reset role;
select tests.ok((select count(*) = 2 and sum(amount) = 0
                   and count(*) filter (where account = 'player' and amount = 1500 and balance_after = 51500) = 1
                   and count(*) filter (where account = 'game:wages' and amount = -1500 and player_id is null) = 1
                 from public.ledger_entries where transaction_id = (select (r ->> 'transaction_id')::uuid from w_claim)),
                'ledger: player +₦1,500 (balance ₦51,500) and game:wages -₦1,500');
select tests.ok((select status = 'paid' and transaction_id = (select (r ->> 'transaction_id')::uuid from w_claim) and finished_at is not null
                 from public.job_shifts s join public.players p on p.id = s.player_id where p.user_id = :'W'),
                'the shift is marked paid and linked to its transaction');

\echo '== 55. Abandoning, and the daily limit (as W)'
set role authenticated;
select tests.claims(:'W');
select tests.ok((select (public.start_job_shift('okada-rider') ->> 'pay')::bigint = 9000), 'W starts an okada shift');
select tests.ok((public.abandon_job_shift() ->> 'abandoned')::boolean, 'W abandons it');
select tests.expect_error($$select public.abandon_job_shift()$$, 'OG404', 'nothing left to abandon');
select tests.expect_error($$select public.claim_job_shift(gen_random_uuid())$$, 'OG404', 'an abandoned shift pays nothing');
select tests.ok((select cash = 51500 from public.players), 'abandoning paid nothing');
reset role;
-- 18 more shifts started in the last 24 hours (as postgres) brings W to the limit of 20.
insert into public.job_shifts (player_id, job_key, pay, started_at, ends_at, status, finished_at)
  select p.id, 'buka-helper', 1500, now() - interval '1 hour', now() - interval '58 minutes', 'abandoned', now() - interval '58 minutes'
    from public.players p, generate_series(1, 18) where p.user_id = :'W';
set role authenticated;
select tests.claims(:'W');
select tests.ok(((public.get_my_jobs() ->> 'shifts_today')::int = 20), 'W has started 20 shifts in 24 hours');
select tests.expect_error($$select public.start_job_shift('buka-helper')$$, 'OG429', 'the 21st shift in 24 hours is refused');
reset role;

\echo '== 56. Finished shifts are history (as postgres)'
select tests.expect_error(format($$update public.job_shifts set pay = 100000 where player_id = (select id from public.players where user_id = %L) and status = 'paid'$$, :'W'), '42501', 'a paid shift cannot be edited');
select tests.expect_error(format($$delete from public.job_shifts where player_id = (select id from public.players where user_id = %L)$$, :'W'), '42501', 'shifts cannot be deleted');
set role authenticated;
select tests.claims(:'S');
select public.start_job_shift('buka-helper') is not null;
reset role;
select tests.expect_error(format($$update public.job_shifts set pay = 100000 where player_id = (select id from public.players where user_id = %L) and status = 'working'$$, :'S'), '42501', 'a working shift''s pay cannot be raised');
select tests.expect_error(format($$update public.job_shifts set ends_at = now() where player_id = (select id from public.players where user_id = %L) and status = 'working'$$, :'S'), '42501', 'a working shift cannot be shortened');
set role authenticated;
select tests.claims(:'S');
select (public.abandon_job_shift() ->> 'abandoned')::boolean;
reset role;

\echo '== 57. Shopping (as S)'
set role authenticated;
select tests.claims(:'S');
select tests.ok((select jsonb_array_length(public.get_shop('buka')) = 3 and jsonb_array_length(public.get_shop('mama-t-stores')) = 3), 'two shops with 3 items each');
select tests.expect_error($$select public.get_shop('ikea')$$, 'OG404', 'unknown shop');
select tests.expect_error($$select public.buy_shop_item('zobo', 0, gen_random_uuid())$$, '22023', 'quantity 0 refused');
select tests.expect_error($$select public.buy_shop_item('zobo', 21, gen_random_uuid())$$, '22023', 'quantity above 20 refused');
select tests.expect_error($$select public.buy_shop_item('amala-plate', 6, gen_random_uuid())$$, '22023', 'more than the item''s per-purchase limit refused');
select tests.expect_error($$select public.buy_shop_item('gold-bar', 1, gen_random_uuid())$$, 'OG404', 'unknown item refused');
select tests.expect_error($$select public.buy_shop_item('ZOBO', 1, gen_random_uuid())$$, '22023', 'malformed item key refused');
select tests.expect_error($$select public.buy_shop_item('zobo', 1, null)$$, '22023', 'purchase without a request id refused');
create temp table s_buy as select public.buy_shop_item('zobo', 2, '44444444-4444-4444-8444-444444444444') as r;
select tests.ok((select (r ->> 'total')::bigint = 800 and (r ->> 'cash')::bigint = 49200 and (r ->> 'owned')::int = 2 and not (r ->> 'replayed')::boolean from s_buy),
                'bought 2 zobo for ₦800 (price from the database): balance ₦49,200, 2 owned');
select tests.ok((select quantity = 2 from public.inventory_items i join public.inventories v on v.id = i.inventory_id where i.item_key = 'zobo'),
                'the zobo is in S''s inventory');
select tests.ok((select (r ->> 'replayed')::boolean and (r ->> 'cash')::bigint = 49200 and (r ->> 'owned')::int = 2
                 from (select public.buy_shop_item('zobo', 2, '44444444-4444-4444-8444-444444444444') as r) s), 'same request again: replayed, not charged or given twice');
select tests.expect_error($$select public.buy_shop_item('zobo', 3, '44444444-4444-4444-8444-444444444444')$$, 'OG422', 'same request id with another quantity refused');
select tests.ok((select (public.buy_shop_item('water-sachet', 20, gen_random_uuid()) ->> 'owned')::int = 23), 'water: 20 bought on top of the 3 starter sachets = 23');
select tests.ok((select quantity = 23 from public.inventory_items i where i.item_key = 'water-sachet'), 'buying an item adds to the existing stack');
reset role;
-- Bag limit: 999 of one item.
update public.inventory_items i set quantity = 998 from public.inventories v, public.players p
 where v.id = i.inventory_id and p.id = v.player_id and p.user_id = :'S' and i.item_key = 'zobo';
set role authenticated;
select tests.claims(:'S');
select tests.expect_error($$select public.buy_shop_item('zobo', 2, gen_random_uuid())$$, 'OG409', 'cannot hold more than 999 of one item');
select tests.ok((select cash = 48200 from public.players), 'S has ₦48,200 (49,200 - 20 × ₦50); the refused purchase charged nothing');
reset role;
set role authenticated;
select tests.claims(:'P');
select tests.expect_error($$select public.buy_shop_item('adire-scarf', 1, gen_random_uuid())$$, 'OG402', 'not enough cash refused');
select tests.ok((select (public.buy_shop_item('water-sachet', 2, gen_random_uuid()) ->> 'cash')::bigint = 0), 'P spends exactly their last ₦100');
select tests.expect_error($$select public.buy_shop_item('water-sachet', 1, gen_random_uuid())$$, 'OG402', 'P with ₦0 cannot buy');
select tests.ok((select cash = 0 from public.players), 'P is at ₦0, never negative');
reset role;

\echo '== 58. The whole ledger still balances and money is conserved (as postgres)'
select tests.ok((select bool_and(cash >= 0) from public.players), 'no negative balances');
select tests.ok(not exists (select 1 from public.economy_transactions t
                 where (select count(*) from public.ledger_entries e where e.transaction_id = t.id) <> 2
                    or (select sum(amount) from public.ledger_entries e where e.transaction_id = t.id) <> 0),
                'every transaction has two lines summing to zero');
select tests.ok((select sum(cash) from public.players) + (select sum(amount) from public.ledger_entries where account <> 'player') = :money_before,
                'cash + game accounts unchanged by jobs and shopping (wages in = game:wages out, purchases out = shop-sales in)');
select tests.ok(not exists (
  select 1 from public.players p
  join lateral (select balance_after from public.ledger_entries e where e.player_id = p.id order by e.id desc limit 1) last on true
  where last.balance_after <> p.cash), 'every player''s latest ledger balance equals their cash');
select tests.ok((select count(*) filter (where account = 'game:wages') = 1 and count(*) filter (where account = 'game:shop-sales') = 3
                 from public.ledger_entries), 'one wage line, three shop-sale lines (S: zobo, water; P: water)');

\echo '== done'
