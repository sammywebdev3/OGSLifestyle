-- READ-ONLY check that a database matches the economy after migration 20261023000000_phase3_4a_jobs_shops.sql:
-- land registry and ledger (Phase 3.3A, as widened by 3.4A), jobs and shifts, shops (Phase 3.4A), and that
-- the Phase 1 / 3.1 objects they must not touch are unchanged. Supersedes phase3_3a_land_check.sql once
-- Phase 3.4A is applied.
--
-- It only reads system catalogs and COUNTS rows: it returns no player ids, user ids, names or balances,
-- and it changes nothing. Run it in Supabase -> SQL Editor as:
--
--     begin transaction read only;
--     <paste this whole file>
--     rollback;
--
-- Every row should say ok = true; "00 ALL CHECKS" is true only when all of them are. Rows starting with
-- "i" are information: i1 "fresh install" is "no" on any database where land has been bought or wages
-- paid; i2 lists trigger functions client roles may EXECUTE (they cannot be called directly).
-- Fingerprints were taken from the reviewed migrations applied to local supabase/postgres 15.8 and 17.6.
-- `npm run test:db` re-checks this file (fresh, after purchases and shifts, after upgrading a 3.3A
-- database that holds a purchase) and that it fails on known-bad variants.
with
tbl(name) as (values ('land_plots'), ('economy_transactions'), ('ledger_entries'), ('economic_requests'), ('jobs'), ('job_shifts'), ('shop_items')),
cls as (
  select c.* from pg_class c join tbl on tbl.name = c.relname
  where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
),
priv(p) as (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')),
client(r) as (values ('anon'), ('authenticated'), ('public')),
-- name, signature, SECURITY DEFINER?, callable by authenticated?, exact body md5, md5 with indentation removed
fns(name, sig, definer, callable, body_exact, body_trimmed) as (values
  ('buy_land_plot',         'public.buy_land_plot(text,uuid)',             true,  true,  'f45aeb74bc54e8b82db336ed260b57e2', 'e43ca04cfd89fa98720ed1e91a8ec0f3'),
  ('get_land_plots',        'public.get_land_plots()',                     true,  true,  'e2b762be251ac49bec6bf1b767fa6572', 'ff884d14ba243b19b025956b8a50f30c'),
  ('get_my_land',           'public.get_my_land()',                        true,  true,  '4da7fc7b232ba8f0f8de1564461a7455', 'aa21383ae5b360d8d9a2f74fcbbcf783'),
  ('ledger_check_balanced', 'public.ledger_check_balanced()',              true,  false, '232d1c041a990d32b3cb093ee58a6a01', '89bcbe6328c2c5d08455d11f5232057b'),
  ('economy_append_only',   'public.economy_append_only()',                false, false, 'b6998c9e776b8b4c53e9089d1c6a1a21', '5ad318545e0b5f9ea1474a2aa5c604b6'),
  ('start_job_shift',       'public.start_job_shift(text)',                true,  true,  '5cd05592da9093bd3e6726d44da23bfc', '235b944295da34fc3e74b1d959e10dda'),
  ('claim_job_shift',       'public.claim_job_shift(uuid)',                true,  true,  'b68a98af63744c293de8e00535f54086', '79b52cdc1e7350df564611bf55917a50'),
  ('abandon_job_shift',     'public.abandon_job_shift()',                  true,  true,  '0e9ec5f7ac6919506f348eef70729d80', '1760406e24cc3aa74e584929a4666cb1'),
  ('get_my_jobs',           'public.get_my_jobs()',                        true,  true,  '64b8788863d410372aa623510cd5bc1e', 'cd6baf0cd87ab63aad3279d9c602ce0d'),
  ('get_shop',              'public.get_shop(text)',                       true,  true,  'effce431e4df6239c1fff38857f791d1', 'f19ccd57d9453aee9a8ba9d2d1464114'),
  ('buy_shop_item',         'public.buy_shop_item(text,integer,uuid)',     true,  true,  '0a2024ef790c5898a5edec1f0cb242f9', 'e1c623d9f307c9f5bedb09717023ff15'),
  ('job_shifts_guard',      'public.job_shifts_guard()',                   false, false, 'a1991831ce860a0834d00eb0c4a9608c', 'a80d3b60f4db62f68981fafaa3ecff3e')
),
fn as (select fns.*, p.oid, p.prosecdef, p.proconfig, p.proowner, p.prosrc, p.prorettype
       from fns left join pg_proc p on p.oid = to_regprocedure(fns.sig)),
-- Function bodies with CRs removed, and additionally with leading/trailing spaces/tabs removed
-- (the SQL Editor may re-indent pasted text; line breaks and every other character must match).
body as (select name, body_exact, body_trimmed,
                md5(replace(prosrc, chr(13), '')) as exact,
                md5(regexp_replace(replace(prosrc, chr(13), ''), '^[ ' || chr(9) || ']+|[ ' || chr(9) || ']+$', '', 'gn')) as trimmed
         from fn where oid is not null),
plots as (select * from public.land_plots),
checks(check_name, ok, detail) as (
  select '01 economy tables exist', count(*) = 7, coalesce(string_agg(relname, ', ' order by relname), 'none')
    from cls
  union all
  select '02 row level security on (not forced)', count(*) = 7 and bool_and(relrowsecurity and not relforcerowsecurity),
         coalesce(string_agg(relname || ' rls=' || relrowsecurity || ' force=' || relforcerowsecurity, ', ' order by relname), 'none')
    from cls
  union all
  select '03 no policies on the economy tables', count(*) = 0,
         coalesce(string_agg(tablename || ': ' || policyname, '; ' order by tablename), 'none')
    from pg_policies where schemaname = 'public' and tablename in (select name from tbl)
  union all
  select '04 anon/authenticated/PUBLIC: no table privileges', count(*) = 0,
         coalesce(string_agg(client.r || ' ' || p || ' ' || tbl.name, ', '), 'none')
    from tbl cross join priv cross join client
   where to_regclass('public.' || tbl.name) is not null and has_table_privilege(client.r, 'public.' || tbl.name, p)
  union all
  select '05 client roles cannot use the ledger sequence',
         to_regclass('public.ledger_entries_id_seq') is not null
           and not has_sequence_privilege('anon', 'public.ledger_entries_id_seq', 'usage')
           and not has_sequence_privilege('authenticated', 'public.ledger_entries_id_seq', 'usage'),
         coalesce(to_regclass('public.ledger_entries_id_seq')::text, 'missing')
  union all
  select '06 columns, types, NOT NULL, defaults (fingerprint)',
         coalesce(md5(string_agg(c.relname || '.' || a.attname || ':' || format_type(a.atttypid, a.atttypmod) || ':' || a.attnotnull
                  || ':' || coalesce(pg_get_expr(d.adbin, d.adrelid), '') || ':' || a.attidentity::text, '|' order by c.relname collate "C", a.attnum)), '')
           = 'cffb77aa1cc2562a7ed57f36b8d5b088',
         'compare the columns with the migration if false'
    from cls c
    join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
    left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
  union all
  select '07 keys, foreign keys, checks (fingerprint)',
         coalesce(md5(string_agg(c.relname || ':' || k.contype::text || ':' || pg_get_constraintdef(k.oid), '|' order by c.relname || ':' || k.contype::text || ':' || pg_get_constraintdef(k.oid) collate "C")), '')
           = 'f42035d7d58a70d39cdf7d5c7bb1eb27',
         count(*) || ' constraints'
    from cls c join pg_constraint k on k.conrelid = c.oid
  union all
  -- Unique indexes that are not constraints (one shift in progress per player, one payout per shift).
  select '07a unique indexes outside constraints (fingerprint)',
         coalesce(md5(string_agg(pg_get_indexdef(i.indexrelid) || ':' || i.indisvalid, '|' order by pg_get_indexdef(i.indexrelid) collate "C")), '')
           = '0500da63f62ff158a1be5212230c1f6f',
         coalesce(string_agg(ic.relname, ', ' order by ic.relname), 'none')
    from pg_index i join cls c on c.oid = i.indrelid join pg_class ic on ic.oid = i.indexrelid
   where i.indisunique and not exists (select 1 from pg_constraint k where k.conindid = i.indexrelid)
  union all
  select '08 triggers: append-only x3, deferred balance check x1, shift guard x1',
         count(*) filter (where t.tgname in ('economy_transactions_append_only', 'ledger_entries_append_only', 'economic_requests_append_only')
                          and t.tgfoid = to_regprocedure('public.economy_append_only()') and t.tgenabled = 'O') = 3
         and count(*) filter (where t.tgname = 'ledger_entries_balanced' and t.tgdeferrable and t.tginitdeferred
                          and t.tgfoid = to_regprocedure('public.ledger_check_balanced()') and t.tgenabled = 'O') = 1
         and count(*) filter (where t.tgname = 'job_shifts_guard' and t.tgfoid = to_regprocedure('public.job_shifts_guard()') and t.tgenabled = 'O') = 1
         and count(*) = 5,
         coalesce(string_agg(t.tgname || '(' || t.tgenabled::text || ')', ', ' order by t.tgname), 'none')
    from pg_trigger t where not t.tgisinternal and t.tgrelid in (select oid from cls)
  union all
  select '09 functions exist with the reviewed signatures', count(*) filter (where oid is not null) = 12
         and (select count(*) from pg_proc where pronamespace = 'public'::regnamespace and proname in ('buy_land_plot', 'claim_job_shift', 'buy_shop_item', 'start_job_shift')) = 4
         and coalesce(bool_and(case when name = 'buy_land_plot' then prorettype = 'jsonb'::regtype else true end), false),
         coalesce(string_agg(case when oid is null then sig || ' MISSING' end, ', '), 'all present; no overloads of the money functions')
    from fn
  union all
  select '10 security definer flags, empty search_path, owner postgres',
         coalesce(bool_and(oid is not null and prosecdef = definer and proconfig = array['search_path=""'] and pg_get_userbyid(proowner) = 'postgres'), false),
         coalesce(string_agg(name || ' definer=' || coalesce(prosecdef::text, '?') || ' config=' || coalesce(proconfig::text, 'none'), '; ' order by name), 'none')
    from fn
  union all
  select '11 execute: authenticated only on the 9 player functions; trigger functions not callable',
         coalesce(bool_and(oid is not null
           and has_function_privilege('authenticated', oid, 'EXECUTE') = callable
           and not has_function_privilege('anon', oid, 'EXECUTE')
           and not exists (select 1 from aclexplode(coalesce((select proacl from pg_proc where pg_proc.oid = fn.oid), acldefault('f', proowner))) x where x.grantee = 0 and x.privilege_type = 'EXECUTE')), false),
         coalesce(string_agg(name || ' auth=' || coalesce(has_function_privilege('authenticated', oid, 'EXECUTE')::text, '?')
                  || ' anon=' || coalesce(has_function_privilege('anon', oid, 'EXECUTE')::text, '?'), '; ' order by name), 'none')
    from fn
  union all
  select '12 ' || name || ' body = reviewed version (fingerprint)',
         exact = body_exact or trimmed = body_trimmed,
         case when exact = body_exact then 'match=exact' when trimmed = body_trimmed then 'match=same code (only indentation/trailing spaces differ)'
              else 'match=DIFFERENT' end
    from body
  union all
  select '13 12 seeded plots: keys, tiers, prices, footprints (fingerprint)',
         (select count(*) from plots) = 12
         and (select md5(string_agg(plot_key || ':' || location_id || ':' || tier || ':' || price || ':' || tile_x || ',' || tile_y || ',' || width || ',' || depth, '|' order by plot_key collate "C")) from plots)
           = 'ddc98221e8c492045f5857bfe0122b1e',
         (select count(*) from plots) || ' plots; '
           || (select string_agg(tier || '=' || n, ' ' order by tier) from (select tier, count(*) n from plots group by tier) t)
  union all
  select '14 prices: basic 25000, standard 50000, premium 100000',
         coalesce(bool_and(price = case tier when 'basic' then 25000 when 'standard' then 50000 when 'premium' then 100000 end), false),
         count(*) filter (where price <> case tier when 'basic' then 25000 when 'standard' then 50000 when 'premium' then 100000 end) || ' plots priced differently'
    from plots
  union all
  -- Phase 3.3A has no trading: a plot is owned exactly when it was bought, by its (only) buyer.
  select '15 ownership is consistent (owned plot <-> one purchase by that owner)',
         count(*) = 0, count(*) || ' plots whose owner, date and purchases disagree'
    from plots l
   where (l.owner_player_id is null) <> (l.acquired_at is null)
      or (select count(*) from public.economy_transactions t where t.plot_id = l.id and t.kind = 'land_purchase')
         <> case when l.owner_player_id is null then 0 else 1 end
      or (l.owner_player_id is not null and not exists (
            select 1 from public.economy_transactions t
             where t.plot_id = l.id and t.player_id = l.owner_player_id and t.kind = 'land_purchase' and t.amount = l.price))
  union all
  select '16 every transaction has 2 ledger lines summing to 0', count(*) = 0,
         count(*) || ' unbalanced transactions (of ' || (select count(*) from public.economy_transactions) || ')'
    from public.economy_transactions t
   where (select count(*) from public.ledger_entries e where e.transaction_id = t.id) <> 2
      or (select coalesce(sum(amount), 0) from public.ledger_entries e where e.transaction_id = t.id) <> 0
  union all
  select '17 each player''s latest ledger balance equals their cash', count(*) = 0,
         count(*) || ' players whose cash differs from their last ledger line'
    from public.players p
    join lateral (select balance_after from public.ledger_entries e where e.player_id = p.id order by e.id desc limit 1) last on true
   where last.balance_after <> p.cash
  union all
  select '18 no negative cash; stored requests match their transactions',
         (select count(*) from public.players where cash < 0) = 0
         and not exists (select 1 from public.economic_requests r join public.economy_transactions t on t.id = r.transaction_id
                          where t.player_id <> r.player_id or t.plot_id <> r.plot_id),
         (select count(*) from public.players where cash < 0) || ' negative balances'
  union all
  select '18a jobs and shop catalogue (fingerprint)',
         (select md5(string_agg(job_key || ':' || location_id || ':' || pay || ':' || duration_seconds || ':' || active, '|' order by job_key collate "C")) from public.jobs)
           || (select md5(string_agg(item_key || ':' || shop_key || ':' || price || ':' || max_per_purchase || ':' || active, '|' order by item_key collate "C")) from public.shop_items)
           = 'bffeeca0229efd81ce79b582f889f1024636e887372e3658b5e76a655425a0d6',
         (select count(*) from public.jobs) || ' jobs, ' || (select count(*) from public.shop_items) || ' shop items'
  union all
  select '18b every paid shift has exactly one matching wage payment; others none',
         count(*) = 0, count(*) || ' shifts whose status and payment disagree'
    from public.job_shifts s
   where (s.status = 'paid') <> exists (select 1 from public.economy_transactions t
                                         where t.id = s.transaction_id and t.kind = 'job_payout' and t.job_shift_id = s.id
                                           and t.player_id = s.player_id and t.amount = s.pay)
      or (select count(*) from public.economy_transactions t where t.job_shift_id = s.id) <> case when s.status = 'paid' then 1 else 0 end
  union all
  select '18c at most one working shift per player',
         not exists (select 1 from public.job_shifts where status = 'working' group by player_id having count(*) > 1),
         (select count(*) from public.job_shifts where status = 'working') || ' shifts in progress'
  union all
  select '19 Phase 1 policies unchanged (fingerprint)',
         coalesce(md5(string_agg(tablename || ':' || policyname || ':' || cmd || ':' || array_to_string(roles, ',') || ':'
                  || coalesce(qual, '') || ':' || coalesce(with_check, ''), '|' order by tablename, policyname)), '')
           = '4648b23a26c0323f87ecb0616f343d37',
         count(*) || ' policies in public'
    from pg_policies where schemaname = 'public'
  union all
  select '20 Phase 1 tables: authenticated SELECT only',
         not exists (select 1 from (values ('public.players'), ('public.inventories'), ('public.inventory_items')) t(n), priv
                      where to_regclass(t.n) is not null and (has_table_privilege('anon', t.n, p) or (p <> 'SELECT' and has_table_privilege('authenticated', t.n, p))))
         and (select count(*) from pg_trigger where not tgisinternal and tgrelid in (select oid from pg_class where relnamespace = 'public'::regnamespace and relname in ('players', 'inventories', 'inventory_items'))) = 0,
         'no write privileges and no triggers on players/inventories/inventory_items'
  union all
  -- "Callable" = what a client could invoke as an RPC. Functions returning trigger or event_trigger
  -- are excluded: PostgreSQL refuses to call them directly (0A000), whatever the grants. Our own
  -- trigger functions are still required to have no client EXECUTE (check 11), and any trigger
  -- function that client roles hold EXECUTE on is listed in i2, so nothing is hidden.
  select '21 callable functions: exactly the 12 reviewed ones; anon none',
         coalesce(array_agg(p.proname::text order by p.proname) filter (where has_function_privilege('authenticated', p.oid, 'EXECUTE')), '{}')
           = array['abandon_job_shift', 'buy_land_plot', 'buy_shop_item', 'claim_job_shift', 'create_character', 'get_land_plots',
                   'get_my_jobs', 'get_my_land', 'get_player_profiles', 'get_shop', 'mp_my_player_id', 'start_job_shift']
         and count(*) filter (where has_function_privilege('anon', p.oid, 'EXECUTE')) = 0,
         coalesce(array_to_string(array_agg(p.proname::text order by p.proname) filter (where has_function_privilege('authenticated', p.oid, 'EXECUTE')), ', '), 'none')
    from pg_proc p where p.pronamespace = 'public'::regnamespace
     and p.prorettype not in ('trigger'::regtype, 'event_trigger'::regtype)
  union all
  select 'i2 trigger functions in public that client roles may EXECUTE (cannot be called directly)', true,
         coalesce(string_agg(p.proname || ' (' || format_type(p.prorettype, null)
                             || case when exists (select 1 from pg_event_trigger e where e.evtfoid = p.oid) then ', event trigger: '
                                     || (select string_agg(e.evtname || case when e.evtenabled = 'D' then ' disabled' else '' end, ', ') from pg_event_trigger e where e.evtfoid = p.oid)
                                     else '' end || ')', '; ' order by p.proname), 'none')
    from pg_proc p where p.pronamespace = 'public'::regnamespace
     and p.prorettype in ('trigger'::regtype, 'event_trigger'::regtype)
     and (has_function_privilege('anon', p.oid, 'EXECUTE') or has_function_privilege('authenticated', p.oid, 'EXECUTE'))
  union all
  select 'i1 fresh install (no plot owned, empty ledger)', true,
         case when (select count(*) from plots where owner_player_id is not null) = 0 and (select count(*) from public.ledger_entries) = 0
              then 'yes' else 'no' end
         || ': owned plots=' || (select count(*) from plots where owner_player_id is not null)
         || ' transactions=' || (select count(*) from public.economy_transactions)
         || ' ledger lines=' || (select count(*) from public.ledger_entries)
         || ' paid shifts=' || (select count(*) from public.job_shifts where status = 'paid')
         || ' shop purchases=' || (select count(*) from public.economy_transactions where kind = 'shop_purchase')
)
select '00 ALL CHECKS' as check_name, bool_and(ok) as ok, count(*) filter (where not ok) || ' failing' as detail from checks
union all
select * from checks
order by 1;
