-- UNDO for supabase/migrations/20261019000000_phase3_1_multiplayer.sql.
-- NOT a migration (it lives outside supabase/migrations, so no tool applies it).
--
-- Removes ONLY the objects that migration added: three policies on
-- realtime.messages, then the two functions (the policies use mp_my_player_id).
-- It touches no table and no data: players, inventories, items and cash stay as
-- they are. Multiplayer simply stops connecting ("Multiplayer offline").
--
-- Run it in the SQL Editor wrapped in:  begin;  <this file>  commit;
-- npm run test:db checks it on a throwaway database.
drop policy if exists "mp: players broadcast only on their own topic" on realtime.messages;
drop policy if exists "mp: players join room presence" on realtime.messages;
drop policy if exists "mp: players read room and player topics" on realtime.messages;
drop function if exists public.get_player_profiles(uuid[]);
drop function if exists public.mp_my_player_id();
