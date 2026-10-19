-- OGUN STATE LIFESTYLE — Phase 3.1: real-time multiplayer foundation.
--
-- No new tables. Positions travel as ephemeral Supabase Realtime messages and are
-- never written to the database. This migration only adds:
--   * public.mp_my_player_id()          — the caller's own player id (or null).
--   * public.get_player_profiles(uuid[]) — the name and avatar of other players,
--                                          so remote players can be labelled.
--   * Realtime Authorization policies on realtime.messages for PRIVATE channels:
--       mp:<room>              presence only: who is in the room.
--       mp:<room>:<player id>  broadcast: that player's movement. Only the player
--                              who owns the id may send on it, so a message on this
--                              topic is known to come from that player.
--     Every policy requires a signed-in user who has a character.
--
-- Topic format must match src/features/multiplayer/protocol.ts.

-- The caller's player id, or null for anon / users without a character.
-- SECURITY INVOKER: it reads public.players under the caller's own select-own RLS.
create or replace function public.mp_my_player_id()
returns uuid
language sql
stable
security invoker
set search_path = ''
as $$
  select p.id from public.players p where p.user_id = (select auth.uid());
$$;

revoke all on function public.mp_my_player_id() from public, anon;
grant execute on function public.mp_my_player_id() to authenticated;

-- Names and avatars of other players (no cash, location, user id or inventory).
-- SECURITY DEFINER because players RLS only lets a user read their own row.
create or replace function public.get_player_profiles(p_player_ids uuid[])
returns table (player_id uuid, character_name text, avatar jsonb)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if not exists (select 1 from public.players p where p.user_id = (select auth.uid())) then
    raise exception 'You need a character to see other players' using errcode = '28000';
  end if;
  if p_player_ids is null or cardinality(p_player_ids) > 50 then
    raise exception 'Ask for between 0 and 50 players' using errcode = '22023';
  end if;
  return query
    select p.id, p.character_name, p.avatar from public.players p where p.id = any (p_player_ids);
end;
$$;

revoke all on function public.get_player_profiles(uuid[]) from public, anon;
grant execute on function public.get_player_profiles(uuid[]) to authenticated;

-- Realtime Authorization (private channels only). Realtime checks these policies
-- when a client joins a private channel, with realtime.topic() set to its topic.

-- Receive presence and broadcasts on multiplayer topics: players with a character.
create policy "mp: players read room and player topics" on realtime.messages
  for select to authenticated
  using (
    realtime.messages.extension in ('broadcast', 'presence')
    and (select realtime.topic()) ~ '^mp:[a-z0-9-]{1,40}(:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})?$'
    and (select public.mp_my_player_id()) is not null
  );

-- Announce yourself (presence) in a room. Nobody may broadcast on a room topic.
create policy "mp: players join room presence" on realtime.messages
  for insert to authenticated
  with check (
    realtime.messages.extension = 'presence'
    and (select realtime.topic()) ~ '^mp:[a-z0-9-]{1,40}$'
    and (select public.mp_my_player_id()) is not null
  );

-- Send movement only on your OWN player topic: mp:<room>:<your player id>.
create policy "mp: players broadcast only on their own topic" on realtime.messages
  for insert to authenticated
  with check (
    realtime.messages.extension = 'broadcast'
    and (select realtime.topic()) ~ '^mp:[a-z0-9-]{1,40}:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and split_part((select realtime.topic()), ':', 3) = (select public.mp_my_player_id())::text
  );
