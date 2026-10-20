-- Database tests for Phase 3.2 (chat and emotes). NO new migration: chat and emotes
-- reuse the Phase 3.1 policies. These checks prove that is safe: the broadcast policy
-- is about the TOPIC (only your own mp:<room>:<player id>), whatever the event name,
-- so chat/emote events are bound to their sender exactly like movement.
--
-- Runs after phase3_1_multiplayer.test.sql in the same DISPOSABLE database (A and B
-- have characters, C has none) and reuses its helpers. NEVER run against a real project.

\set ON_ERROR_STOP 1
\set QUIET 1

-- Like tests.rt_can, but with an explicit Realtime event name (e.g. 'chat').
create or replace function tests.rt_can_send(topic text, ext text, ev text) returns boolean language plpgsql as $$
begin
  perform set_config('realtime.topic', topic, true);
  begin
    insert into realtime.messages (topic, extension, event, payload) values (realtime.topic(), ext, ev, '{}');
    return true;
  exception when insufficient_privilege then
    return false;
  end;
end $$;
grant execute on function tests.rt_can_send(text, text, text) to anon, authenticated;

select id as a_pid from public.players where user_id = '00000000-0000-4000-a000-00000000000a' \gset
select id as b_pid from public.players where user_id = '00000000-0000-4000-a000-00000000000b' \gset
select 'mp:kuto-street:' || :'a_pid' as a_topic, 'mp:kuto-street:' || :'b_pid' as b_topic \gset

\echo '== 20. Phase 3.2 adds no policy or function'
select tests.ok((select count(*) = 3 from pg_policies where schemaname = 'realtime' and tablename = 'messages'),
                'realtime.messages still has exactly the 3 Phase 3.1 policies');
select tests.ok((select bool_and(coalesce(qual, '') || coalesce(with_check, '') not like '%event%') from pg_policies
                 where schemaname = 'realtime' and tablename = 'messages'),
                'no policy depends on the event name (so chat cannot slip through an event-based gap)');

\echo '== 21. Chat and emotes as player A'
set role authenticated;
select tests.claims('00000000-0000-4000-a000-00000000000a');
select tests.ok(tests.rt_can_send(:'a_topic', 'broadcast', 'chat'), 'A can send chat on A''s own topic');
select tests.ok(tests.rt_can_send(:'a_topic', 'broadcast', 'emote'), 'A can send an emote on A''s own topic');
select tests.ok(not tests.rt_can_send(:'b_topic', 'broadcast', 'chat'), 'A cannot send chat on B''s topic (no impersonation)');
select tests.ok(not tests.rt_can_send(:'b_topic', 'broadcast', 'emote'), 'A cannot send an emote on B''s topic');
select tests.ok(not tests.rt_can_send('mp:kuto-street', 'broadcast', 'chat'), 'A cannot send chat on the room topic');
select tests.ok(not tests.rt_can_send('mp:other-room:' || :'b_pid', 'broadcast', 'chat'), 'A cannot send chat as B in another room either');
select tests.ok(tests.rt_can(:'b_topic', 'broadcast', 'read'), 'A can receive B''s chat (same read rule as movement)');
reset role;

\echo '== 22. No character, or not signed in: no chat at all'
set role authenticated;
select tests.claims('00000000-0000-4000-a000-00000000000c');
select tests.ok(not tests.rt_can_send(:'a_topic', 'broadcast', 'chat'), 'C (no character) cannot send chat on any player topic');
select tests.ok(not tests.rt_can(:'a_topic', 'broadcast', 'read'), 'C cannot read chat');
reset role;
set role anon;
select tests.claims(null);
select tests.ok(not tests.rt_can_send(:'a_topic', 'broadcast', 'chat'), 'anon cannot send chat');
select tests.ok(not tests.rt_can(:'a_topic', 'broadcast', 'read'), 'anon cannot read chat');
reset role;

\echo '== 23. Nothing persistent changed (as postgres)'
select tests.ok((select count(*) = 2 and bool_and(cash = 50000) from public.players), 'players and cash unchanged');
select tests.ok((select count(*) = 6 from public.inventory_items), 'inventory items unchanged');

\echo '== done'
