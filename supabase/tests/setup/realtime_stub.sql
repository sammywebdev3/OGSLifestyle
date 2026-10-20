-- TEST-ONLY stand-in for the parts of Supabase Realtime that RLS policies use.
--
-- On a hosted Supabase project the Realtime service creates realtime.messages and
-- realtime.topic() itself. The local supabase/postgres image only has an empty
-- "realtime" schema, so scripts/test-db.sh loads this file BEFORE the migrations.
-- It mirrors Supabase's definitions (columns, RLS on, realtime.topic() reading the
-- "realtime.topic" setting that Realtime sets when it checks a channel join).
-- Runs as supabase_admin (owner of the "realtime" schema in this image). The table is
-- owned by a realtime admin role that postgres belongs to, so the migration (run as
-- postgres, like the SQL Editor) can add policies to it, as on a hosted project.
-- Never apply this to a real project.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'supabase_realtime_admin') then
    create role supabase_realtime_admin nologin noinherit;
  end if;
end $$;
grant supabase_realtime_admin to postgres;

create table if not exists realtime.messages (
  topic text not null,
  extension text not null,
  payload jsonb,
  event text,
  private boolean default false,
  updated_at timestamp without time zone not null default now(),
  inserted_at timestamp without time zone not null default now(),
  id uuid not null default gen_random_uuid()
);
alter table realtime.messages owner to supabase_realtime_admin;
alter table realtime.messages enable row level security;

create or replace function realtime.topic() returns text
language sql stable
as $$ select nullif(current_setting('realtime.topic', true), '')::text; $$;

grant usage on schema realtime to anon, authenticated;
grant select, insert, update on realtime.messages to anon, authenticated;
grant execute on function realtime.topic() to anon, authenticated;
