-- Database tests for supabase/migrations/20261020000000_phase3_3a_land.sql
--
-- Runs after the Phase 1 / 3.1 / 3.2 tests in the same DISPOSABLE database (A and B
-- have characters with ₦50,000 each, C has none) and reuses their tests.* helpers.
-- Concurrency (separate connections) and mutation checks live in scripts/test-db.sh.
-- NEVER run against a real project.

\set ON_ERROR_STOP 1
\set QUIET 1

\set A '00000000-0000-4000-a000-00000000000a'
\set B '00000000-0000-4000-a000-00000000000b'
\set C '00000000-0000-4000-a000-00000000000c'

\echo '== 30. Land: structure, RLS, grants and function security'
select tests.ok((select count(*) = 4 and bool_and(relrowsecurity) from pg_class
                 where oid in ('public.land_plots'::regclass, 'public.economy_transactions'::regclass,
                               'public.ledger_entries'::regclass, 'public.economic_requests'::regclass)),
                'RLS enabled on land_plots, economy_transactions, ledger_entries, economic_requests');
select tests.ok((select count(*) = 0 from pg_policies where schemaname = 'public'
                 and tablename in ('land_plots', 'economy_transactions', 'ledger_entries', 'economic_requests')),
                'no policies on the economy tables (clients cannot read or write them at all)');
select tests.ok(not exists (
  select 1 from (values ('anon'), ('authenticated'), ('public')) r(role),
       (values ('public.land_plots'), ('public.economy_transactions'), ('public.ledger_entries'), ('public.economic_requests')) t(tbl),
       (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')) p(priv)
  where has_table_privilege(r.role, t.tbl, p.priv)), 'anon, authenticated and PUBLIC hold no privilege at all on the economy tables');
select tests.ok(not has_sequence_privilege('authenticated', 'public.ledger_entries_id_seq', 'usage')
                and not has_sequence_privilege('anon', 'public.ledger_entries_id_seq', 'usage'),
                'client roles cannot use the ledger id sequence');
select tests.ok((select bool_and(prosecdef and proconfig = array['search_path=""'] and pg_get_userbyid(proowner) = 'postgres')
                 from pg_proc where oid in ('public.buy_land_plot(text, uuid)'::regprocedure, 'public.get_land_plots()'::regprocedure,
                                            'public.get_my_land()'::regprocedure, 'public.ledger_check_balanced()'::regprocedure)),
                'land functions are SECURITY DEFINER, owned by postgres, with an empty search_path');
select tests.ok((select proconfig = array['search_path=""'] from pg_proc where oid = 'public.economy_append_only()'::regprocedure),
                'the append-only trigger function has an empty search_path');
select tests.ok((select bool_and(has_function_privilege('authenticated', oid, 'execute') and not has_function_privilege('anon', oid, 'execute')
                   and not exists (select 1 from aclexplode(proacl) a where a.grantee = 0))
                 from pg_proc where oid in ('public.buy_land_plot(text, uuid)'::regprocedure, 'public.get_land_plots()'::regprocedure, 'public.get_my_land()'::regprocedure)),
                'buy_land_plot, get_land_plots, get_my_land: EXECUTE for authenticated only (not anon, not PUBLIC)');
select tests.ok((select bool_and(not has_function_privilege('authenticated', oid, 'execute') and not has_function_privilege('anon', oid, 'execute'))
                 from pg_proc where oid in ('public.ledger_check_balanced()'::regprocedure, 'public.economy_append_only()'::regprocedure)),
                'trigger functions cannot be executed by client roles');
select tests.ok((select count(*) = 1 from pg_proc where proname = 'buy_land_plot' and pronamespace = 'public'::regnamespace),
                'exactly one buy_land_plot (no overload taking a price, cash or player id)');
select tests.ok((select string_agg(format_type(t, null), ',' order by ord) = 'text,uuid'
                 from unnest((select proargtypes::oid[] from pg_proc where oid = 'public.buy_land_plot(text, uuid)'::regprocedure)) with ordinality u(t, ord)),
                'buy_land_plot takes only (plot key text, idempotency key uuid)');
select tests.ok((select count(*) = 3 from pg_trigger where not tgisinternal and tgname like '%append_only')
                and (select count(*) = 1 from pg_trigger where tgname = 'ledger_entries_balanced' and tgdeferrable and tginitdeferred),
                'append-only triggers on the 3 history tables, deferred balance check on ledger_entries');
select tests.ok(not exists (select 1 from pg_trigger t where not t.tgisinternal
                  and t.tgrelid in ('public.players'::regclass, 'public.inventories'::regclass, 'public.inventory_items'::regclass)),
                'no triggers on players, inventories or inventory_items');

\echo '== 31. Existing policies are unchanged'
select tests.ok((select md5(string_agg(tablename || ':' || policyname || ':' || cmd || ':' || array_to_string(roles, ',') || ':'
                  || coalesce(qual, '') || ':' || coalesce(with_check, ''), '|' order by tablename, policyname))
                 from pg_policies where schemaname = 'public') = '4648b23a26c0323f87ecb0616f343d37',
                'public schema policies are exactly the 3 Phase 1 policies (same fingerprint as the live check)');
select tests.ok((select count(*) = 3 from pg_policies where schemaname = 'realtime' and tablename = 'messages'),
                'realtime.messages still has exactly the 3 Phase 3.1 policies');
select tests.ok(has_table_privilege('authenticated', 'public.players', 'select')
                and not has_table_privilege('authenticated', 'public.players', 'update'),
                'players: authenticated still SELECT only');

\echo '== 32. Seeded plots'
select tests.ok((select count(*) = 12 from public.land_plots), 'exactly 12 plots');
select tests.ok((select array_agg(plot_key order by plot_key) = array(select format('kuto-%s', lpad(i::text, 2, '0')) from generate_series(1, 12) i)
                 from public.land_plots), 'plot keys are kuto-01 … kuto-12');
select tests.ok((select bool_and(owner_player_id is null and acquired_at is null) from public.land_plots), 'every plot starts unowned (for sale by the game)');
select tests.ok((select bool_and(price = case tier when 'basic' then 25000 when 'standard' then 50000 when 'premium' then 100000 end) from public.land_plots),
                'prices: basic ₦25,000, standard ₦50,000, premium ₦100,000');
select tests.ok((select count(*) filter (where tier = 'basic') = 4 and count(*) filter (where tier = 'standard') = 5
                   and count(*) filter (where tier = 'premium') = 3 from public.land_plots), '4 basic, 5 standard, 3 premium');
select tests.ok((select bool_and(location_id = 'kuto-street' and tile_x >= 0 and tile_y >= 0 and tile_x + width <= 20 and tile_y + depth <= 18)
                 from public.land_plots), 'every plot lies inside the 20×18 Kuto Street map');
select tests.ok(not exists (select 1 from public.land_plots a join public.land_plots b on a.id < b.id
                 where a.tile_x < b.tile_x + b.width and b.tile_x < a.tile_x + a.width
                   and a.tile_y < b.tile_y + b.depth and b.tile_y < a.tile_y + a.depth),
                'no two plots overlap');
select tests.ok((select count(*) = 0 from public.economy_transactions) and (select count(*) = 0 from public.ledger_entries)
                and (select count(*) = 0 from public.economic_requests), 'the ledger starts empty (existing cash is pre-ledger)');

\echo '== 33. Anonymous visitors'
set role anon;
select tests.claims(null);
select tests.expect_error($$select public.buy_land_plot('kuto-01', gen_random_uuid())$$, '42501', 'anon cannot call buy_land_plot');
select tests.expect_error($$select * from public.get_land_plots()$$, '42501', 'anon cannot call get_land_plots');
select tests.expect_error($$select * from public.get_my_land()$$, '42501', 'anon cannot call get_my_land');
select tests.expect_error($$select * from public.land_plots$$, '42501', 'anon cannot read land_plots');
reset role;

\echo '== 34. Signed in without a JWT subject, or without a character'
set role authenticated;
select tests.claims(null);
select tests.expect_error($$select public.buy_land_plot('kuto-01', gen_random_uuid())$$, '28000', 'authenticated role without a user id is rejected');
select tests.claims(:'C');
select tests.expect_error($$select public.buy_land_plot('kuto-01', gen_random_uuid())$$, 'OG403', 'C (no character) cannot buy land');
select tests.expect_error($$select * from public.get_land_plots()$$, '28000', 'C (no character) cannot list land');
select tests.expect_error($$select * from public.get_my_land()$$, '28000', 'C (no character) has no land view');
reset role;

\echo '== 35. Direct client access to the economy tables is denied (as A)'
set role authenticated;
select tests.claims(:'A');
select tests.expect_error($$select * from public.land_plots$$, '42501', 'A cannot SELECT land_plots directly');
select tests.expect_error($$select * from public.ledger_entries$$, '42501', 'A cannot SELECT ledger_entries');
select tests.expect_error($$select * from public.economy_transactions$$, '42501', 'A cannot SELECT economy_transactions');
select tests.expect_error($$select * from public.economic_requests$$, '42501', 'A cannot SELECT economic_requests');
select tests.expect_error(format($$update public.land_plots set owner_player_id = %L, acquired_at = now()$$, public.mp_my_player_id()), '42501', 'A cannot UPDATE a plot owner');
select tests.expect_error($$insert into public.land_plots (plot_key, location_id, tier, price, tile_x, tile_y, width, depth) values ('kuto-99', 'kuto-street', 'basic', 1000, 0, 0, 1, 1)$$, '42501', 'A cannot INSERT a plot');
select tests.expect_error($$delete from public.land_plots$$, '42501', 'A cannot DELETE plots');
select tests.expect_error($$truncate public.land_plots cascade$$, '42501', 'A cannot TRUNCATE plots');
select tests.expect_error(format($$insert into public.economy_transactions (kind, player_id, amount) values ('land_purchase', %L, 1)$$, public.mp_my_player_id()), '42501', 'A cannot INSERT a transaction');
select tests.expect_error(format($$insert into public.ledger_entries (transaction_id, account, player_id, amount, balance_after) values (gen_random_uuid(), 'player', %L, 1000000, 1000000)$$, public.mp_my_player_id()), '42501', 'A cannot INSERT ledger lines');
select tests.expect_error($$update public.players set cash = cash + 1000000$$, '42501', 'A still cannot UPDATE cash');
select tests.expect_error($$select public.ledger_check_balanced()$$, '42501', 'A cannot call the ledger trigger function');

\echo '== 36. Malformed and invalid requests (as A)'
select tests.expect_error($$select public.buy_land_plot(null, gen_random_uuid())$$, '22023', 'null plot key rejected');
select tests.expect_error($$select public.buy_land_plot('', gen_random_uuid())$$, '22023', 'empty plot key rejected');
select tests.expect_error($$select public.buy_land_plot('KUTO-01', gen_random_uuid())$$, '22023', 'upper-case plot key rejected');
select tests.expect_error($$select public.buy_land_plot('kuto-1', gen_random_uuid())$$, '22023', 'one-digit plot key rejected');
select tests.expect_error($$select public.buy_land_plot('kuto-01'' or ''1''=''1', gen_random_uuid())$$, '22023', 'SQL-looking plot key rejected');
select tests.expect_error($$select public.buy_land_plot(repeat('a', 500) || '-01', gen_random_uuid())$$, '22023', 'very long plot key rejected');
select tests.expect_error($$select public.buy_land_plot('kuto-01', null)$$, '22023', 'null idempotency key rejected');
select tests.expect_error($$select public.buy_land_plot('kuto-01', 'not-a-uuid')$$, '22P02', 'non-uuid idempotency key rejected');
select tests.expect_error($$select public.buy_land_plot('kuto-99', gen_random_uuid())$$, 'OG404', 'unknown plot rejected');
select tests.expect_error($$select public.buy_land_plot('kuto-01', gen_random_uuid(), 1)$$, '42883', 'no way to pass a price');
select tests.expect_error(format($$select public.buy_land_plot(%L::uuid, 'kuto-01', gen_random_uuid())$$, :'B'), '42883', 'no way to pass a player id');
select tests.ok((select bool_and(cash = 50000) from (select cash from public.players) s), 'failed requests changed no cash (A sees own row)');
reset role;
select tests.ok((select count(*) = 0 from public.ledger_entries) and (select bool_and(owner_player_id is null) from public.land_plots),
                'failed requests wrote no ledger lines and sold no plot');

\echo '== 37. Successful purchase (A buys basic plot kuto-07 for ₦25,000)'
set role authenticated;
select tests.claims(:'A');
create temp table a_buy as select public.buy_land_plot('kuto-07', '11111111-1111-4111-8111-111111111111') as r;
select tests.ok((select (r ->> 'cash')::bigint = 25000 and (r ->> 'price')::bigint = 25000 and r ->> 'plot_key' = 'kuto-07'
                   and (r ->> 'owned_by_me')::boolean and not (r ->> 'replayed')::boolean from a_buy),
                'result: price ₦25,000, new balance ₦25,000, owned, not a replay');
select tests.ok((select cash = 25000 from public.players), 'A''s cash in the database is now ₦25,000');
select tests.ok((select count(*) = 1 and bool_and(plot_key = 'kuto-07' and price_paid = 25000 and acquired_at is not null) from public.get_my_land()),
                'get_my_land shows kuto-07, paid ₦25,000');
select tests.ok((select owned_by_me and owner_name = 'Ọlá Adéyẹmí' from public.get_land_plots() where plot_key = 'kuto-07'),
                'get_land_plots shows A as the owner');
reset role;
select tests.ok((select owner_player_id = (select id from public.players where user_id = :'A') from public.land_plots where plot_key = 'kuto-07'),
                'the registry records A as the one owner');
select tests.ok((select count(*) = 2 and sum(amount) = 0 from public.ledger_entries
                 where transaction_id = (select (r ->> 'transaction_id')::uuid from a_buy)),
                'two ledger lines that sum to zero');
select tests.ok((select bool_and(case account when 'player' then amount = -25000 and balance_after = 25000
                                             when 'game:land-sales' then amount = 25000 and player_id is null and balance_after is null end)
                 from public.ledger_entries), 'player line -₦25,000 (balance after ₦25,000), game:land-sales line +₦25,000');

\echo '== 38. Retries and duplicates (as A)'
set role authenticated;
select tests.claims(:'A');
select tests.ok((select (r ->> 'replayed')::boolean and (r ->> 'cash')::bigint = 25000
                   and r ->> 'transaction_id' = (select r ->> 'transaction_id' from a_buy)
                 from (select public.buy_land_plot('kuto-07', '11111111-1111-4111-8111-111111111111') as r) s),
                'same idempotency key again: same transaction, replayed, not charged twice');
select tests.ok((select cash = 25000 from public.players), 'A''s cash is still ₦25,000 after the retry');
select tests.expect_error($$select public.buy_land_plot('kuto-08', '11111111-1111-4111-8111-111111111111')$$, 'OG422', 'same idempotency key for a different plot is rejected');
select tests.expect_error($$select public.buy_land_plot('kuto-07', gen_random_uuid())$$, 'OG409', 'buying a plot you already own (new request) is rejected');
select tests.expect_error($$select public.buy_land_plot('kuto-05', gen_random_uuid())$$, 'OG402', 'premium plot (₦100,000) with ₦25,000: not enough cash');
select tests.ok((select cash = 25000 from public.players), 'rejected requests left A''s cash at ₦25,000');
reset role;
select tests.ok((select count(*) = 2 from public.ledger_entries) and (select count(*) = 1 from public.economic_requests),
                'still one transaction (two lines) and one stored request');

\echo '== 39. Another player (B)'
set role authenticated;
select tests.claims(:'B');
select tests.expect_error($$select public.buy_land_plot('kuto-07', gen_random_uuid())$$, 'OG409', 'B cannot buy A''s plot');
select tests.ok((select not owned_by_me and owner_name = 'Ọlá Adéyẹmí' from public.get_land_plots() where plot_key = 'kuto-07'),
                'B sees A''s character name as the owner, not as B''s');
select tests.ok((select count(*) = 0 from public.get_my_land()), 'B''s private land view is empty (A''s purchase is not visible to B)');
select tests.ok((select count(*) = 12 from public.get_land_plots()), 'B sees all 12 plots');
select tests.ok((select string_agg(p.parameter_name::text, ',' order by p.ordinal_position)
                 from information_schema.parameters p join information_schema.routines r on r.specific_name = p.specific_name
                 where r.routine_schema = 'public' and r.routine_name = 'get_land_plots' and p.parameter_mode = 'OUT')
                = 'plot_key,location_id,tier,price,tile_x,tile_y,width,depth,owner_name,owned_by_me',
                'public plot info has no player id, user id, cash or purchase history');
-- A's idempotency key means nothing to B: B using it is just B's own new request.
create temp table b_buy as select public.buy_land_plot('kuto-01', '11111111-1111-4111-8111-111111111111') as r;
select tests.ok((select (r ->> 'cash')::bigint = 0 and not (r ->> 'replayed')::boolean from b_buy),
                'B buys standard kuto-01 for ₦50,000 (balance ₦0); A''s key does not leak A''s result to B');
select tests.expect_error($$select public.buy_land_plot('kuto-08', gen_random_uuid())$$, 'OG402', 'B with ₦0 cannot buy a basic plot');
select tests.ok((select cash = 0 from public.players), 'B''s cash is ₦0, never negative');
reset role;

\echo '== 40. History is append-only and every transaction balances (as postgres)'
select tests.expect_error($$update public.ledger_entries set amount = 1$$, '42501', 'ledger lines cannot be updated, even by postgres');
select tests.expect_error($$delete from public.ledger_entries$$, '42501', 'ledger lines cannot be deleted');
select tests.expect_error($$update public.economy_transactions set amount = 1$$, '42501', 'transactions cannot be updated');
select tests.expect_error($$delete from public.economic_requests$$, '42501', 'stored requests cannot be deleted');
do $$
declare v_tx uuid;
begin
  insert into public.economy_transactions (kind, player_id, plot_id, amount)
    select 'land_purchase', p.id, l.id, 1000 from public.players p, public.land_plots l limit 1 returning id into v_tx;
  insert into public.ledger_entries (transaction_id, account, amount) values (v_tx, 'game:land-sales', 1000);
  begin
    set constraints public.ledger_entries_balanced immediate;
    raise exception 'FAIL: an unbalanced ledger transaction was accepted';
  exception when check_violation then
    raise notice 'PASS: an unbalanced ledger transaction is refused (23514)';
  end;
  raise exception 'undo' using errcode = 'P0099';
exception when sqlstate 'P0099' then null; -- roll the probe back
end $$;
select tests.ok((select count(*) = 4 from public.ledger_entries), 'the unbalanced probe left nothing behind');

\echo '== 41. Money is conserved and matches the ledger (as postgres)'
select tests.ok((select bool_and(cash >= 0) from public.players), 'no negative balances');
select tests.ok((select sum(amount) = 0 from public.ledger_entries), 'all ledger lines sum to zero');
select tests.ok((select sum(cash) from public.players)
                + (select coalesce(sum(amount), 0) from public.ledger_entries where account <> 'player')
                = 2 * 50000, 'players'' cash + game:land-sales = total pre-ledger cash (2 × ₦50,000)');
-- Each player's latest balance_after equals their cash, and the chain of lines is consistent.
select tests.ok(not exists (
  select 1 from public.players p
  join lateral (select balance_after from public.ledger_entries e where e.player_id = p.id order by e.id desc limit 1) last on true
  where last.balance_after <> p.cash), 'every player''s latest ledger balance equals players.cash');
select tests.ok(not exists (
  select 1 from (select player_id, balance_after, amount, lag(balance_after) over (partition by player_id order by id) prev
                 from public.ledger_entries where account = 'player') s
  where prev is not null and prev + amount <> balance_after), 'each player line follows from the previous one');
select tests.ok((select bool_and(p.cash = 50000 + coalesce((select sum(amount) from public.ledger_entries e where e.player_id = p.id), 0))
                 from public.players p), 'players.cash = ₦50,000 pre-ledger starting cash + their ledger lines');

\echo '== 42. Nothing else changed'
select tests.ok((select count(*) = 2 from public.players), 'still exactly two players');
select tests.ok((select count(*) = 6 and sum(quantity) = 10 from public.inventory_items), 'inventory items unchanged (6 rows, 10 items)');
select tests.ok((select count(*) = 2 from public.inventories), 'inventories unchanged');

\echo '== done'
