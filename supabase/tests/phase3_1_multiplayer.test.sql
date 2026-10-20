-- Database tests for supabase/migrations/20261019000000_phase3_1_multiplayer.sql
--
-- Runs after phase1_players.test.sql in the same DISPOSABLE database (users A and B
-- have characters, C has none) and reuses its tests.* helpers. NEVER run against a
-- real project.
--
-- Realtime channel joins are emulated the way Supabase Realtime checks them: set
-- "realtime.topic" to the channel topic, then try to INSERT (send / track presence)
-- or SELECT (receive) a realtime.messages row as the user. realtime.messages comes
-- from supabase/tests/setup/realtime_stub.sql here.

\set ON_ERROR_STOP 1
\set QUIET 1

-- Can the CURRENT role send (op = 'write') or receive (op = 'read') `ext` messages on `topic`?
create or replace function tests.rt_can(topic text, ext text, op text) returns boolean language plpgsql as $$
begin
  perform set_config('realtime.topic', topic, true);
  if op = 'read' then
    return exists (select 1 from realtime.messages m where m.topic = realtime.topic() and m.extension = ext);
  end if;
  begin
    insert into realtime.messages (topic, extension, payload) values (realtime.topic(), ext, '{}');
    return true;
  exception when insufficient_privilege then
    return false;
  end;
end $$;
grant execute on function tests.rt_can(text, text, text) to anon, authenticated;

select id as a_pid from public.players where user_id = '00000000-0000-4000-a000-00000000000a' \gset
select id as b_pid from public.players where user_id = '00000000-0000-4000-a000-00000000000b' \gset
\set room_topic 'mp:kuto-street'
select 'mp:kuto-street:' || :'a_pid' as a_topic, 'mp:kuto-street:' || :'b_pid' as b_topic \gset

-- Messages that exist on each topic, so "read" checks have something to find (as postgres).
insert into realtime.messages (topic, extension, payload) values
  (:'room_topic', 'presence', '{}'), (:'a_topic', 'broadcast', '{}'), (:'b_topic', 'broadcast', '{}'),
  ('secret-room', 'broadcast', '{}');

\echo '== 10. Multiplayer functions: security settings and grants'
select tests.ok((select prosecdef and proconfig = array['search_path=""'] and pg_get_userbyid(proowner) = 'postgres'
                 from pg_proc where oid = 'public.get_player_profiles(uuid[])'::regprocedure),
                'get_player_profiles is SECURITY DEFINER, owned by postgres, empty search_path');
select tests.ok((select not prosecdef and proconfig = array['search_path=""']
                 from pg_proc where oid = 'public.mp_my_player_id()'::regprocedure),
                'mp_my_player_id is SECURITY INVOKER with empty search_path');
select tests.ok(not has_function_privilege('anon', 'public.get_player_profiles(uuid[])', 'execute')
                and not has_function_privilege('anon', 'public.mp_my_player_id()', 'execute'),
                'anon cannot call the multiplayer functions');
select tests.ok(has_function_privilege('authenticated', 'public.get_player_profiles(uuid[])', 'execute'),
                'authenticated can call get_player_profiles');
select tests.ok((select count(*) = 0 from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r'
                 and relname not in ('players', 'inventories', 'inventory_items')),
                'no new tables in public');

\echo '== 11. Anonymous visitors (anon)'
set role anon;
select tests.claims(null);
select tests.expect_error(format('select * from public.get_player_profiles(array[%L]::uuid[])', :'b_pid'), '42501', 'anon cannot read player profiles');
select tests.ok(not tests.rt_can(:'room_topic', 'presence', 'write'), 'anon cannot join room presence');
select tests.ok(not tests.rt_can(:'a_topic', 'broadcast', 'write'), 'anon cannot broadcast on a player topic');
select tests.ok(not tests.rt_can(:'room_topic', 'presence', 'read'), 'anon cannot listen to a room');
reset role;

\echo '== 12. Signed in, but no character (user C)'
set role authenticated;
select tests.claims('00000000-0000-4000-a000-00000000000c');
select tests.ok(public.mp_my_player_id() is null, 'C has no player id');
select tests.expect_error(format('select * from public.get_player_profiles(array[%L]::uuid[])', :'b_pid'), '28000', 'C cannot read profiles without a character');
select tests.ok(not tests.rt_can(:'room_topic', 'presence', 'write'), 'C cannot join room presence');
select tests.ok(not tests.rt_can(:'room_topic', 'presence', 'read'), 'C cannot listen to a room');
select tests.ok(not tests.rt_can(:'b_topic', 'broadcast', 'read'), 'C cannot listen to a player topic');
reset role;

\echo '== 13. Player A: profiles'
set role authenticated;
select tests.claims('00000000-0000-4000-a000-00000000000a');
select tests.ok(public.mp_my_player_id() = :'a_pid'::uuid, 'mp_my_player_id returns A''s own player id');
select tests.ok((select count(*) = 1 and bool_and(character_name = 'Bayo Ade') from public.get_player_profiles(array[:'b_pid']::uuid[])),
                'A can read B''s name');
select tests.ok((select string_agg(p.parameter_name::text, ',' order by p.ordinal_position)
                 from information_schema.parameters p join information_schema.routines r on r.specific_name = p.specific_name
                 where r.routine_schema = 'public' and r.routine_name = 'get_player_profiles' and p.parameter_mode = 'OUT')
                = 'player_id,character_name,avatar',
                'profiles return only player_id, character_name, avatar (no cash, user id or location)');
select tests.ok((select count(*) = 0 from public.get_player_profiles(array['00000000-0000-4000-a000-0000000000ff']::uuid[])),
                'unknown player ids return nothing');
select tests.ok((select count(*) = 0 from public.get_player_profiles(array[]::uuid[])), 'an empty list returns nothing');
select tests.expect_error('select * from public.get_player_profiles(null)', '22023', 'a null list is rejected');
select tests.expect_error('select * from public.get_player_profiles(array(select gen_random_uuid() from generate_series(1, 51)))', '22023', 'more than 50 ids is rejected');
select tests.ok((select count(*) = 1 from public.players), 'A still sees only their own row in players (RLS unchanged)');

-- get_player_profiles answers only for ids the caller already knows. These checks pin
-- down that a player cannot discover or guess ids through it or anything else.
do $$
declare found bigint := 0;
begin
  for i in 1..20 loop -- 1,000 random guesses, in batches of the maximum 50
    found := found + (select count(*) from public.get_player_profiles(array(select gen_random_uuid() from generate_series(1, 50))));
  end loop;
  perform tests.ok(found = 0, '1,000 guessed player ids return nothing (the function cannot list or search players)');
end $$;
select tests.expect_error($$select * from public.get_player_profiles(array['%']::uuid[])$$, '22P02', 'no wildcard or pattern lookup: ids must be real uuids');
select tests.ok((select count(*) = 0 from public.players where id <> public.mp_my_player_id()), 'A cannot see any other player id through the players table');
select tests.ok((select count(*) = 0 from public.inventories i where i.player_id <> public.mp_my_player_id()), 'A cannot see any other player id through inventories');

\echo '== 14. Player A: Realtime channel authorization'
select tests.ok(tests.rt_can(:'room_topic', 'presence', 'write'), 'A can join room presence');
select tests.ok(tests.rt_can(:'room_topic', 'presence', 'read'), 'A can see room presence');
select tests.ok(not tests.rt_can(:'room_topic', 'broadcast', 'write'), 'A cannot broadcast on the room topic');
select tests.ok(tests.rt_can(:'a_topic', 'broadcast', 'write'), 'A can broadcast on A''s own topic');
select tests.ok(not tests.rt_can(:'b_topic', 'broadcast', 'write'), 'A cannot broadcast on B''s topic (no impersonation)');
select tests.ok(tests.rt_can(:'b_topic', 'broadcast', 'read'), 'A can receive B''s movement');
select tests.ok(not tests.rt_can(:'a_topic', 'presence', 'write'), 'A cannot track presence on a player topic');
select tests.ok(not tests.rt_can('secret-room', 'broadcast', 'read'), 'A cannot read non-multiplayer topics');
select tests.ok(not tests.rt_can('secret-room', 'broadcast', 'write'), 'A cannot write non-multiplayer topics');
select tests.ok(not tests.rt_can('mp:Kuto Street', 'presence', 'write'), 'malformed room names are rejected');
select tests.ok(not tests.rt_can(:'a_topic' || ':extra', 'broadcast', 'write'), 'extra topic segments are rejected');
select tests.ok(not tests.rt_can(upper(:'a_topic'), 'broadcast', 'write'), 'upper-case variant of A''s topic is rejected');
select tests.ok(not tests.rt_can('mp:kuto-street:' || replace(:'a_pid', '-', ''), 'broadcast', 'write'), 'A''s id without dashes is rejected');
reset role;

\echo '== 15. Player B cannot use A''s topic either'
set role authenticated;
select tests.claims('00000000-0000-4000-a000-00000000000b');
select tests.ok(not tests.rt_can(:'a_topic', 'broadcast', 'write'), 'B cannot broadcast on A''s topic');
select tests.ok(tests.rt_can(:'b_topic', 'broadcast', 'write'), 'B can broadcast on B''s own topic');
reset role;

\echo '== 16. No other way to obtain player ids (as postgres)'
-- Regression guard: if a future migration adds a function or view that clients can
-- call, these fail until someone checks it cannot leak other players' ids.
select tests.ok((select array_agg(p.proname::text order by p.proname) from pg_proc p
                 where p.pronamespace = 'public'::regnamespace and has_function_privilege('authenticated', p.oid, 'execute'))
                = array['create_character', 'get_player_profiles', 'mp_my_player_id'],
                'authenticated can call exactly create_character, get_player_profiles and mp_my_player_id');
select tests.ok(not exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and has_function_privilege('anon', p.oid, 'execute')),
                'anon can call no public function');
select tests.ok((select count(*) = 0 from pg_class where relnamespace = 'public'::regnamespace and relkind in ('v', 'm')),
                'no views or materialized views in public');

\echo '== 17. Nothing persistent changed (as postgres)'
select tests.ok((select count(*) = 2 from public.players), 'still exactly two players');
select tests.ok((select bool_and(cash = 50000) from public.players), 'cash unchanged');

\echo '== done'
