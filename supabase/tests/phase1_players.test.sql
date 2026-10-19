-- Database tests for supabase/migrations/20261018000000_phase1_players.sql
--
-- Runs against a DISPOSABLE local Supabase Postgres (see scripts/test-db.sh).
-- NEVER run this against a real project: it inserts users into auth.users.
--
-- Each check prints "PASS: ..." or aborts the script with an error.
-- Requests are simulated the way PostgREST does it: SET ROLE to anon /
-- authenticated and put the JWT "sub" claim into request.jwt.claim(s).

\set ON_ERROR_STOP 1
\set QUIET 1

-- ---------- test helpers (schema "tests", only in the disposable database) ----------
create schema if not exists tests;
grant usage on schema tests to anon, authenticated;

create or replace function tests.ok(cond boolean, label text) returns void language plpgsql as $$
begin
  if cond is not true then raise exception 'FAIL: %', label; end if;
  raise notice 'PASS: %', label;
end $$;

-- Runs `stmt` as the CURRENT role and asserts it fails with `expected` SQLSTATE.
create or replace function tests.expect_error(stmt text, expected text, label text) returns void language plpgsql as $$
begin
  begin
    execute stmt;
  exception when others then
    if sqlstate = expected then raise notice 'PASS: % (%)', label, sqlstate; return; end if;
    raise exception 'FAIL: % — expected %, got % (%)', label, expected, sqlstate, sqlerrm;
  end;
  raise exception 'FAIL: % — expected error %, but it succeeded', label, expected;
end $$;

-- Simulate a signed-in request for user `uid` (or an anonymous one when uid is null).
create or replace function tests.claims(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(uid::text, ''), false);
  perform set_config('request.jwt.claims',
    case when uid is null then '{"role":"anon"}' else json_build_object('sub', uid, 'role', 'authenticated')::text end, false);
end $$;

grant execute on function tests.ok(boolean, text), tests.expect_error(text, text, text), tests.claims(uuid) to anon, authenticated;

-- Test users (as postgres)
insert into auth.users (id, email) values
  ('00000000-0000-4000-a000-00000000000a', 'ada@test.local'),
  ('00000000-0000-4000-a000-00000000000b', 'bayo@test.local'),
  ('00000000-0000-4000-a000-00000000000c', 'chi@test.local'),
  ('00000000-0000-4000-a000-00000000000d', 'dayo@test.local')
on conflict do nothing;

\echo '== 1. Structure: grants, RLS, function security'
select tests.ok((select bool_and(relrowsecurity) from pg_class where oid in ('public.players'::regclass, 'public.inventories'::regclass, 'public.inventory_items'::regclass)), 'RLS enabled on all three tables');
select tests.ok(not has_table_privilege('anon', 'public.players', 'select'), 'anon has no SELECT on players');
select tests.ok(has_table_privilege('authenticated', 'public.players', 'select'), 'authenticated has SELECT on players');
select tests.ok(not exists (
  select 1 from (values ('anon'), ('authenticated')) r(role),
       (values ('public.players'), ('public.inventories'), ('public.inventory_items')) t(tbl),
       (values ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')) p(priv)
  where has_table_privilege(r.role, t.tbl, p.priv)), 'anon/authenticated hold no write, TRUNCATE, REFERENCES or TRIGGER privileges');
select tests.ok((select prosecdef from pg_proc where oid = 'public.create_character(text, jsonb)'::regprocedure), 'create_character is SECURITY DEFINER');
select tests.ok((select proconfig = array['search_path=""'] from pg_proc where oid = 'public.create_character(text, jsonb)'::regprocedure), 'create_character has an empty search_path');
select tests.ok((select pg_get_userbyid(proowner) = 'postgres' from pg_proc where oid = 'public.create_character(text, jsonb)'::regprocedure), 'create_character is owned by postgres');
select tests.ok(not has_function_privilege('anon', 'public.create_character(text, jsonb)', 'execute'), 'anon cannot EXECUTE create_character');
select tests.ok(has_function_privilege('authenticated', 'public.create_character(text, jsonb)', 'execute'), 'authenticated can EXECUTE create_character');
select tests.ok(not exists (select 1 from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
  where p.oid = 'public.create_character(text, jsonb)'::regprocedure and a.grantee = 0), 'PUBLIC has no EXECUTE on create_character');
select tests.ok(
  '00000000-0000-4000-a000-00000000000a'::uuid is not null
  and 'Ọlá Adéyẹmí' collate "C" ~ '^[A-Za-zÀ-ÖØ-öø-ʯḀ-ỿ][A-Za-zÀ-ÖØ-öø-ʯḀ-ỿ̀-ͯ'' .-]*$',
  'name pattern matches Yoruba letters even under the "C" collation (locale-independent)');

\echo '== 2. Anonymous and unauthenticated requests'
set role anon;
select tests.claims(null);
select tests.expect_error($$select public.create_character('Ada Obi', '{"body":"femme","skin":"deep","headwear":"gele","outfit":"adire"}')$$, '42501', 'anon cannot call create_character');
select tests.expect_error($$select * from public.players$$, '42501', 'anon cannot read players');
reset role;

set role authenticated;
select tests.claims(null);
select tests.expect_error($$select public.create_character('Ada Obi', '{"body":"femme","skin":"deep","headwear":"gele","outfit":"adire"}')$$, '28000', 'authenticated role without a user id (no JWT sub) is rejected');
reset role;

\echo '== 3. Valid character with Yoruba accented letters (user A)'
set role authenticated;
select tests.claims('00000000-0000-4000-a000-00000000000a');
create temp table a_result as
  select * from public.create_character('  Ọlá   Adéyẹmí ', '{"body":"femme","skin":"warm","headwear":"gele","outfit":"adire","cash":999999999,"admin":true}');
select tests.ok((select character_name = 'Ọlá Adéyẹmí' from a_result), 'Yoruba name accepted, trimmed and spaces collapsed');
select tests.ok((select user_id = '00000000-0000-4000-a000-00000000000a' from a_result), 'character belongs to the caller (from auth.uid())');
select tests.ok((select cash = 50000 from a_result), 'starting cash set by the server (₦50,000), client value ignored');
select tests.ok((select location = 'kuto-starter-apartment' from a_result), 'starting location set by the server');
select tests.ok((select avatar = '{"body":"femme","skin":"warm","headwear":"gele","outfit":"adire"}'::jsonb from a_result), 'avatar stored with only the four known keys (cash/admin dropped)');
select tests.ok((select count(*) = 3 from public.inventory_items), 'starter inventory has 3 item rows');
select tests.ok((select sum(quantity) = 5 from public.inventory_items), 'starter items: phone 1 + key 1 + water 3');
reset role;

\echo '== 4. Name normalisation and other legitimate names (user B, then rolled back)'
set role authenticated;
select tests.claims('00000000-0000-4000-a000-00000000000b');
begin;
  -- "Ọlá" typed with a combining dot below (NFD) is stored in composed form (NFC)
  select tests.ok((select character_name = normalize(U&'O\0323la\0301 Bello', nfc) from public.create_character(U&'O\0323la\0301 Bello', '{"body":"masc","skin":"deep","headwear":"fila","outfit":"ogun"}')), 'decomposed (NFD) accents are normalised to NFC');
rollback;
begin;
  select tests.ok((select character_name = 'Ɗanjuma Ƙaura' from public.create_character('Ɗanjuma Ƙaura', '{"body":"masc","skin":"deep","headwear":"cap","outfit":"ink"}')), 'Hausa letters (Ɗ, Ƙ) accepted');
rollback;
begin;
  select tests.ok((select character_name = 'Emeka O''Neil-Ụzọ' from public.create_character('Emeka O''Neil-Ụzọ', '{"body":"masc","skin":"brown","headwear":"none","outfit":"palm"}')), 'Igbo letters, apostrophe and hyphen accepted');
rollback;

\echo '== 5. Invalid names and avatars (user B)'
select tests.expect_error($$select public.create_character('Ab', '{"body":"masc","skin":"deep","headwear":"fila","outfit":"ogun"}')$$, '22023', 'too short (2 letters)');
select tests.expect_error($$select public.create_character('Abcdefghijklmnopqrstu', '{"body":"masc","skin":"deep","headwear":"fila","outfit":"ogun"}')$$, '22023', 'too long (21 letters)');
select tests.expect_error($$select public.create_character('Kemi123', '{"body":"masc","skin":"deep","headwear":"fila","outfit":"ogun"}')$$, '22023', 'digits rejected');
select tests.expect_error($$select public.create_character('<script>', '{"body":"masc","skin":"deep","headwear":"fila","outfit":"ogun"}')$$, '22023', 'HTML/script characters rejected');
select tests.expect_error($$select public.create_character('Kemi 😀', '{"body":"masc","skin":"deep","headwear":"fila","outfit":"ogun"}')$$, '22023', 'emoji rejected');
select tests.expect_error($$select public.create_character(U&'Ke\200Bmi', '{"body":"masc","skin":"deep","headwear":"fila","outfit":"ogun"}')$$, '22023', 'zero-width space rejected');
select tests.expect_error($$select public.create_character('Ola×Ade', '{"body":"masc","skin":"deep","headwear":"fila","outfit":"ogun"}')$$, '22023', 'multiplication sign rejected');
select tests.expect_error($$select public.create_character('-Kemi', '{"body":"masc","skin":"deep","headwear":"fila","outfit":"ogun"}')$$, '22023', 'must start with a letter');
select tests.expect_error($$select public.create_character('Иван Петров', '{"body":"masc","skin":"deep","headwear":"fila","outfit":"ogun"}')$$, '22023', 'non-Latin script rejected (matches app rule)');
select tests.expect_error($$select public.create_character(null, '{"body":"masc","skin":"deep","headwear":"fila","outfit":"ogun"}')$$, '22023', 'null name rejected');
select tests.expect_error($$select public.create_character('Bayo Ade', '{"body":"robot","skin":"deep","headwear":"fila","outfit":"ogun"}')$$, '22023', 'unknown avatar body rejected');
select tests.expect_error($$select public.create_character('Bayo Ade', null)$$, '22023', 'null avatar rejected');
select tests.ok((select count(*) = 0 from public.players), 'no rows were created by the failed attempts');

\echo '== 6. No way to create a character for another user'
select tests.expect_error($$select public.create_character('00000000-0000-4000-a000-00000000000a'::uuid, 'Fake Ada', '{"body":"femme","skin":"deep","headwear":"gele","outfit":"adire"}'::jsonb)$$, '42883', 'there is no overload that accepts a user id');
select tests.expect_error($$insert into public.players (user_id, character_name, avatar, cash) values ('00000000-0000-4000-a000-00000000000a', 'Fake Ada', '{}', 1000000)$$, '42501', 'direct INSERT of a player is denied');
create temp table b_result as select * from public.create_character('Bayo Ade', '{"body":"masc","skin":"deep","headwear":"fila","outfit":"ogun"}');
select tests.ok((select user_id = '00000000-0000-4000-a000-00000000000b' from b_result), 'user B''s character is bound to B, not A');

\echo '== 7. Duplicate character'
select tests.expect_error($$select public.create_character('Bayo Again', '{"body":"masc","skin":"deep","headwear":"fila","outfit":"ogun"}')$$, '23505', 'second character for the same user is rejected');

\echo '== 8. Reading and modifying another user''s data (as B)'
select tests.ok((select count(*) = 1 from public.players), 'B sees exactly one player row (their own)');
select tests.ok((select count(*) = 0 from public.players where user_id = '00000000-0000-4000-a000-00000000000a'), 'B cannot see A''s player');
select tests.ok((select count(*) = 1 from public.inventories), 'B sees only their own inventory');
select tests.ok((select count(*) = 3 from public.inventory_items), 'B sees only their own 3 inventory items');
select tests.expect_error($$update public.players set cash = 999999999 where user_id = '00000000-0000-4000-a000-00000000000b'$$, '42501', 'B cannot UPDATE their own cash');
select tests.expect_error($$update public.players set cash = 0 where user_id = '00000000-0000-4000-a000-00000000000a'$$, '42501', 'B cannot UPDATE A''s player');
select tests.expect_error($$delete from public.players where user_id = '00000000-0000-4000-a000-00000000000a'$$, '42501', 'B cannot DELETE A''s player');
select tests.expect_error($$truncate public.players cascade$$, '42501', 'B cannot TRUNCATE players');
select tests.expect_error($$insert into public.inventory_items (inventory_id, item_key, quantity) select id, 'adire-scarf', 99 from public.inventories$$, '42501', 'B cannot add items to an inventory');
select tests.expect_error($$update public.inventory_items set quantity = 999$$, '42501', 'B cannot change item quantities');
select tests.expect_error($$delete from public.inventories$$, '42501', 'B cannot DELETE inventories');
reset role;

\echo '== 9. Data integrity after all attempts (as postgres)'
select tests.ok((select count(*) = 2 from public.players), 'exactly two players exist (A and B)');
select tests.ok((select cash = 50000 from public.players where user_id = '00000000-0000-4000-a000-00000000000a'), 'A''s cash is unchanged');
select tests.ok((select count(*) = 2 from public.inventories), 'exactly two inventories exist');

\echo '== done'
