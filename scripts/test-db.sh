#!/usr/bin/env bash
# Database tests for the Supabase migrations, against a DISPOSABLE local container.
#
#   npm run test:db
#
# Starts the official Supabase Postgres image (same build Supabase hosts), applies
# every file in supabase/migrations as the `postgres` role (as Supabase does),
# runs supabase/tests/*.test.sql, then runs real concurrency tests from separate
# connections, and removes the container. It never reads DATABASE_URL or any
# Supabase credentials, so it cannot touch a real project.
set -euo pipefail

IMAGE="${SUPABASE_PG_IMAGE:-supabase/postgres:15.8.1.085}"
PORT="${TEST_DB_PORT:-54329}"
NAME="osl-test-db-$$"
PASS="local-test-only"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

command -v docker >/dev/null || { echo "docker is required" >&2; exit 2; }
command -v psql >/dev/null || { echo "psql (PostgreSQL client) is required" >&2; exit 2; }

cleanup() { docker rm -f "$NAME" >/dev/null 2>&1 || true; }
trap cleanup EXIT

echo "▶ starting $IMAGE on localhost:$PORT"
docker run -d --name "$NAME" -p "127.0.0.1:$PORT:5432" -e POSTGRES_PASSWORD="$PASS" "$IMAGE" >/dev/null
export PGHOST=127.0.0.1 PGPORT="$PORT" PGUSER=postgres PGPASSWORD="$PASS" PGDATABASE=postgres
for _ in $(seq 1 90); do
  if docker logs "$NAME" 2>&1 | grep -q "PostgreSQL init process complete" && psql -Atqc 'select 1' >/dev/null 2>&1; then break; fi
  sleep 1
done
psql -Atqc 'select 1' >/dev/null || { docker logs "$NAME" | tail -20; echo "database did not start" >&2; exit 1; }

echo "▶ applying migrations"
for f in "$ROOT"/supabase/migrations/*.sql; do
  echo "  - $(basename "$f")"
  psql -q -v ON_ERROR_STOP=1 -f "$f" >/dev/null
done

echo "▶ live-check script (supabase/verify/phase1_live_check.sql)"
VERIFY="$ROOT/supabase/verify/phase1_live_check.sql"
all_ok() { psql -X -At -F'|' -v ON_ERROR_STOP=1 "$@" | grep '^00 ALL CHECKS|' | cut -d'|' -f2; }
[ "$(all_ok -f "$VERIFY")" = "t" ] || { psql -X -f "$VERIFY"; echo "FAIL: live-check script does not pass on the migration" >&2; exit 1; }
echo "PASS: live-check script passes on the migrated database"
# Each known-bad change (inside a rolled-back transaction) must make the script fail.
while IFS= read -r bad; do
  [ -n "$bad" ] || continue
  r=$(all_ok -c "begin" -c "$bad" -f "$VERIFY" -c "rollback")
  [ "$r" = "f" ] || { echo "FAIL: live-check script did not catch: $bad" >&2; exit 1; }
done <<'BAD'
alter table public.inventories disable row level security
alter policy "players: read own" on public.players using (true)
grant insert on public.players to authenticated
grant truncate on public.inventory_items to authenticated
grant select on public.players to anon
alter table public.players alter column cash set default 100
alter table public.inventory_items drop constraint inventory_items_quantity_check
create trigger t before insert on public.players for each row execute function suppress_redundant_updates_trigger()
grant create on schema public to service_role; alter function public.create_character(text, jsonb) owner to service_role
alter function public.create_character(text, jsonb) security invoker
alter function public.create_character(text, jsonb) set search_path = public
grant execute on function public.create_character(text, jsonb) to public
grant execute on function public.create_character(text, jsonb) to anon
BAD
echo "PASS: live-check script fails on 13 known-bad variants"

echo "▶ running SQL tests"
for f in "$ROOT"/supabase/tests/*.test.sql; do
  psql -q -v ON_ERROR_STOP=1 -f "$f" 2>&1 | sed -n 's/^psql:[^ ]* NOTICE:  //p; s/^NOTICE:  //p; /^==/p; /FAIL/p; /ERROR/p'
done

echo "▶ concurrency tests"
AVATAR='{"body":"masc","skin":"deep","headwear":"fila","outfit":"ogun"}'
as_user() { # $1 = user id, $2 = SQL; prints the SQLSTATE of any error (verbose)
  psql -X -q -v VERBOSITY=verbose -c "set role authenticated; select tests.claims('$1');" -c "$2" 2>&1 | grep -oE 'ERROR: +[0-9A-Z]{5}' | grep -oE '[0-9A-Z]{5}$' || true
}
# (a) Overlapping transactions: the first holds its insert open for 2s; the second
#     cannot see it yet, passes the EXISTS check, and must be stopped by UNIQUE(user_id).
C=00000000-0000-4000-a000-00000000000c
( psql -X -q -v VERBOSITY=verbose -c "begin; set local role authenticated; select tests.claims('$C'); select public.create_character('Chi One', '$AVATAR'); select pg_sleep(2); commit;" >/dev/null 2>&1 ) &
sleep 0.7
second=$(as_user "$C" "select public.create_character('Chi Two', '$AVATAR');")
wait
n=$(psql -Atqc "select count(*) from public.players where user_id = '$C'")
[ "$second" = "23505" ] && [ "$n" = "1" ] || { echo "FAIL: overlapping create — second got '$second', players=$n" >&2; exit 1; }
echo "PASS: overlapping requests — second blocked on UNIQUE(user_id) and failed with 23505; 1 character"

# (b) Eight simultaneous requests for one fresh user: exactly one may succeed.
D=00000000-0000-4000-a000-00000000000d
tmp=$(mktemp -d)
for i in $(seq 1 8); do as_user "$D" "select public.create_character('Dayo Racer', '$AVATAR');" >"$tmp/$i" & done
wait
ok=0; dup=0
for i in $(seq 1 8); do s=$(cat "$tmp/$i"); if [ -z "$s" ]; then ok=$((ok+1)); elif [ "$s" = "23505" ]; then dup=$((dup+1)); fi; done
rm -rf "$tmp"
counts=$(psql -Atqc "select (select count(*) from public.players where user_id='$D') || '/' || (select count(*) from public.inventories i join public.players p on p.id=i.player_id where p.user_id='$D') || '/' || (select count(*) from public.inventory_items x join public.inventories i on i.id=x.inventory_id join public.players p on p.id=i.player_id where p.user_id='$D')")
[ "$ok" = "1" ] && [ "$dup" = "7" ] && [ "$counts" = "1/1/3" ] || { echo "FAIL: 8 parallel creates — ok=$ok dup=$dup players/inventories/items=$counts" >&2; exit 1; }
echo "PASS: 8 simultaneous requests — 1 succeeded, 7 rejected with 23505; 1 player / 1 inventory / 3 items"

echo "✔ all database tests passed"
