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

export PGHOST=127.0.0.1 PGPORT="$PORT" PGUSER=postgres PGPASSWORD="$PASS" PGDATABASE=postgres
# start_db: a fresh container with the test-only setup (also used again for the upgrade-path test).
start_db() {
  echo "▶ starting $IMAGE on localhost:$PORT"
  docker run -d --name "$NAME" -p "127.0.0.1:$PORT:5432" -e POSTGRES_PASSWORD="$PASS" "$IMAGE" >/dev/null
  for _ in $(seq 1 90); do
    if docker logs "$NAME" 2>&1 | grep -q "PostgreSQL init process complete" && psql -Atqc 'select 1' >/dev/null 2>&1; then break; fi
    sleep 1
  done
  psql -Atqc 'select 1' >/dev/null || { docker logs "$NAME" | tail -20; echo "database did not start" >&2; exit 1; }
  echo "▶ test-only setup (supabase/tests/setup: stand-ins for services the local image lacks)"
  for f in "$ROOT"/supabase/tests/setup/*.sql; do
    echo "  - $(basename "$f")"
    psql -q -v ON_ERROR_STOP=1 -U supabase_admin -f "$f" >/dev/null
  done
}
# apply_migrations [before]: applies supabase/migrations in order; with an argument, only files whose
# name sorts before it (e.g. 20261023 = everything up to and including Phase 3.3A).
apply_migrations() {
  echo "▶ applying migrations${1:+ before $1}"
  for f in "$ROOT"/supabase/migrations/*.sql; do
    if [ -n "${1:-}" ] && [[ ! "$(basename "$f")" < "$1" ]]; then continue; fi
    echo "  - $(basename "$f")"
    psql -q -v ON_ERROR_STOP=1 -f "$f" >/dev/null
  done
}
start_db
apply_migrations

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

# Check 14 (function body). The live function was created from text pasted into the SQL Editor,
# which re-indents it. Recreate the function with a changed body (SQL expression over `src`)
# inside a rolled-back transaction.
DIFF="$ROOT/supabase/verify/phase1_function_diff.sql"
MIGRATION="$ROOT/supabase/migrations/20261018000000_phase1_players.sql"
rebody() {
  echo "do \$d\$ declare src text; begin select prosrc into src from pg_proc where oid = 'public.create_character(text,jsonb)'::regprocedure; execute format('create or replace function public.create_character(p_name text, p_avatar jsonb) returns public.players language plpgsql security definer set search_path = %L as %L', '', $1); end \$d\$"
}
# Whitespace-only edits must pass, be reported as such, and show no differing lines.
while IFS= read -r expr; do
  out=$(psql -X -At -F'|' -v ON_ERROR_STOP=1 -c "begin" -c "$(rebody "$expr")" -f "$VERIFY" -f "$DIFF" -c "rollback")
  echo "$out" | grep -q '^00 ALL CHECKS|t|' \
    && echo "$out" | grep -q '^14 .*|t|match=same code' \
    && echo "$out" | grep -q '^0|SUMMARY: live lines=55 expected=55 differing=0|' \
    || { echo "$out"; echo "FAIL: whitespace-only body change not accepted: $expr" >&2; exit 1; }
done <<'GOOD'
replace(src, chr(10), chr(10) || '    ')
replace(src, chr(10), chr(10) || chr(9) || '  ')
replace(src, chr(10), '   ' || chr(10))
replace(src, chr(10), chr(13) || chr(10) || '  ')
GOOD
echo "PASS: check 14 accepts 4 indentation/trailing-space/CRLF variants of the reviewed body"
# Real code changes that keep all three detail flags true must fail, and the diff script must
# point at the changed migration line. Each line: <expression>|<migration line that changes>
while IFS='|' read -r expr pattern; do
  line=$(grep -nF -- "$pattern" "$MIGRATION" | head -1 | cut -d: -f1)
  out=$(psql -X -At -F'|' -v ON_ERROR_STOP=1 -c "begin" -c "$(rebody "replace($expr, chr(10), chr(10) || '  ')")" -f "$VERIFY" -f "$DIFF" -c "rollback")
  echo "$out" | grep -q '^14 .*|f|match=DIFFERENT.*nfc_normalize=true unicode_allow_list=true starting_cash_50000=true' \
    && echo "$out" | grep -q '^0|SUMMARY: live lines=55 expected=55 differing=1|' \
    && echo "$out" | grep -q "^$line|" \
    || { echo "$out"; echo "FAIL: check 14 / diff did not catch: $expr" >&2; exit 1; }
done <<'BADBODY'
replace(src, '50000,', '500000,')|50000,
replace(src, '.-]*$', '.0-9-]*$')|.-]*$
replace(src, 'return v_player;', 'update public.players set cash = 999999999; return v_player;')|return v_player;
replace(src, 'Ọ ẹ', 'O e')|Ọ ẹ
BADBODY
echo "PASS: check 14 rejects 4 re-indented body changes whose flags are still true and the diff names the changed line"

echo "▶ economy verification script (supabase/verify/phase3_4a_economy_check.sql), fresh database"
# With Phase 3.4A applied, phase3_4a_economy_check.sql (a superset of the 3.3A land check) is the check
# for this database. The 3.3A land check itself is tested on a 3.3A-only database further down
# ("upgrade path"), because that is the state production is in until 3.4A is applied there.
LAND_VERIFY="$ROOT/supabase/verify/phase3_4a_economy_check.sql"
land_rows() { psql -X -At -F'|' -v ON_ERROR_STOP=1 "$@"; }
land_ok() { land_rows "$@" | grep '^00 ALL CHECKS|' | cut -d'|' -f2; }
# Read-only proof: it must run inside a READ ONLY transaction (any write would fail there).
out=$(land_rows -c "begin transaction read only" -f "$LAND_VERIFY" -c "rollback")
echo "$out" | grep -q '^00 ALL CHECKS|t|' && echo "$out" | grep -q '^i1 fresh install.*|t|yes:' \
  || { psql -X -c "begin transaction read only" -f "$LAND_VERIFY" -c "rollback"; echo "FAIL: land check does not pass on a freshly migrated database" >&2; exit 1; }
echo "PASS: land check passes on the fresh migration inside a READ ONLY transaction ($(echo "$out" | grep -c '|t|') rows ok, fresh install = yes)"
# Each known-bad change (inside a rolled-back transaction) must make the check fail.
n=0
while IFS= read -r bad; do
  [ -n "$bad" ] || continue
  r=$(land_ok -c "begin" -c "$bad" -f "$LAND_VERIFY" -c "rollback")
  [ "$r" = "f" ] || { echo "FAIL: land check did not catch: $bad" >&2; exit 1; }
  n=$((n+1))
done <<'BAD'
alter table public.land_plots disable row level security
alter table public.ledger_entries force row level security
create policy "leak" on public.land_plots for select to authenticated using (true)
grant select on public.ledger_entries to authenticated
grant insert on public.economic_requests to anon
grant usage on sequence public.ledger_entries_id_seq to authenticated
grant execute on function public.buy_land_plot(text, uuid) to anon
grant execute on function public.buy_land_plot(text, uuid) to public
revoke execute on function public.get_land_plots() from authenticated
grant execute on function public.ledger_check_balanced() to authenticated
alter function public.buy_land_plot(text, uuid) security invoker
alter function public.get_my_land() set search_path = public
drop trigger ledger_entries_append_only on public.ledger_entries
alter table public.ledger_entries disable trigger ledger_entries_balanced
alter table public.land_plots add column note text
alter table public.land_plots drop constraint land_plots_price_check
alter table public.ledger_entries alter column balance_after drop not null, alter column amount set default 1
update public.land_plots set price = 1000 where plot_key = 'kuto-01'
update public.land_plots set tile_x = 2 where plot_key = 'kuto-05'
delete from public.land_plots where plot_key = 'kuto-12'
insert into public.land_plots (plot_key, location_id, tier, price, tile_x, tile_y, width, depth) values ('kuto-13', 'kuto-street', 'basic', 25000, 5, 16, 1, 1)
create function public.buy_land_plot(text, uuid, bigint) returns jsonb language sql as $$ select '{}'::jsonb $$
do $d$ declare src text; begin select prosrc into src from pg_proc where oid = 'public.buy_land_plot(text,uuid)'::regprocedure; execute format('create or replace function public.buy_land_plot(p_plot_key text, p_idempotency_key uuid) returns jsonb language plpgsql security definer set search_path = %L as %L', '', replace(src, 'if v_player.cash < v_price then', 'if false then')); end $d$
do $d$ declare src text; begin select prosrc into src from pg_proc where oid = 'public.get_land_plots()'::regprocedure; execute format('create or replace function public.get_land_plots() returns table (plot_key text, location_id text, tier text, price bigint, tile_x smallint, tile_y smallint, width smallint, depth smallint, owner_name text, owned_by_me boolean) language plpgsql stable security definer set search_path = %L as %L', '', replace(src, 'o.character_name', 'o.character_name || o.user_id::text')); end $d$
alter policy "players: read own" on public.players using (true)
grant update on public.players to authenticated
create trigger t before update on public.players for each row execute function suppress_redundant_updates_trigger()
create function public.leak_players() returns setof public.players language sql security definer set search_path = '' as $$ select * from public.players $$
create function public.anon_only() returns int language sql as $$ select 1 $$; revoke all on function public.anon_only() from public, authenticated; grant execute on function public.anon_only() to anon
create function public.rls_auto_enable_x() returns setof public.players language sql security definer set search_path = '' as $$ select * from public.players $$
alter table public.job_shifts disable row level security
alter table public.jobs force row level security
create policy "leak" on public.job_shifts for select to authenticated using (true)
grant select on public.jobs to authenticated
grant update on public.shop_items to authenticated
grant insert on public.job_shifts to authenticated
grant execute on function public.claim_job_shift(uuid) to anon
revoke execute on function public.get_shop(text) from authenticated
grant execute on function public.job_shifts_guard() to authenticated
alter function public.buy_shop_item(text, integer, uuid) security invoker
alter function public.start_job_shift(text) set search_path = public
drop trigger job_shifts_guard on public.job_shifts
alter table public.job_shifts disable trigger job_shifts_guard
drop index public.job_shifts_one_active_idx
drop index public.economy_transactions_job_shift_idx
alter table public.economy_transactions drop constraint economy_transactions_details_check
alter table public.ledger_entries drop constraint ledger_entries_account_check, add constraint ledger_entries_account_check check (account like 'game:%' or account = 'player')
alter table public.economic_requests drop constraint economic_requests_plot_check
alter table public.job_shifts add column bonus bigint
alter table public.shop_items alter column max_per_purchase set default 20
update public.jobs set pay = 90000 where job_key = 'buka-helper'
update public.jobs set duration_seconds = 10 where job_key = 'okada-rider'
update public.shop_items set price = 10 where item_key = 'adire-scarf'
update public.shop_items set max_per_purchase = 20 where item_key = 'amala-plate'
insert into public.jobs (job_key, title, description, location_id, pay, duration_seconds) values ('free-money', 'Free money', 'x', 'kuto-street', 100000, 10)
delete from public.shop_items where item_key = 'bread'
create function public.claim_job_shift(uuid, bigint) returns jsonb language sql as $$ select '{}'::jsonb $$
do $d$ declare src text; begin select prosrc into src from pg_proc where oid = 'public.claim_job_shift(uuid)'::regprocedure; execute format('create or replace function public.claim_job_shift(p_idempotency_key uuid) returns jsonb language plpgsql security definer set search_path = %L as %L', '', replace(src, 'now() < v_shift.ends_at', 'false')); end $d$
do $d$ declare src text; begin select prosrc into src from pg_proc where oid = 'public.buy_shop_item(text,integer,uuid)'::regprocedure; execute format('create or replace function public.buy_shop_item(p_item_key text, p_quantity integer, p_idempotency_key uuid) returns jsonb language plpgsql security definer set search_path = %L as %L', '', replace(src, 'v_player.cash < v_total', 'false')); end $d$
BAD
echo "PASS: economy check fails on $n known-bad variants (RLS, policies, grants, sequence, definer, search_path, triggers, indexes, columns, constraints, prices, pay, durations, footprints, plot count, catalogue, overloads, function bodies, Phase 1 policies/grants/triggers, extra callable function)"
# Whitespace-only re-indentation of a function body (what the SQL Editor may do) is accepted and reported.
out=$(land_rows -c "begin" -c "do \$d\$ declare src text; begin select prosrc into src from pg_proc where oid = 'public.buy_land_plot(text,uuid)'::regprocedure; execute format('create or replace function public.buy_land_plot(p_plot_key text, p_idempotency_key uuid) returns jsonb language plpgsql security definer set search_path = %L as %L', '', replace(src, chr(10), chr(10) || '    ')); end \$d\$" -f "$LAND_VERIFY" -c "rollback")
echo "$out" | grep -q '^00 ALL CHECKS|t|' && echo "$out" | grep -q '^12 buy_land_plot body.*|t|match=same code' \
  || { echo "$out"; echo "FAIL: land check rejects a whitespace-only re-indentation of buy_land_plot" >&2; exit 1; }
echo "PASS: land check accepts a re-indented (whitespace-only) buy_land_plot body and reports it"
# Production has a Supabase helper outside this repo: event trigger ensure_rls -> public.rls_auto_enable()
# (SECURITY DEFINER, EXECUTE for anon/authenticated/service_role). Recreate that shape here: the check must
# pass, list it in i2, and still fail on every genuinely callable extra function.
ENSURE_RLS="create function public.rls_auto_enable() returns event_trigger language plpgsql security definer set search_path = pg_catalog as \$f\$ declare r record; begin for r in select * from pg_event_trigger_ddl_commands() where object_type = 'table' and schema_name = 'public' loop execute format('alter table %s enable row level security', r.object_identity); end loop; end \$f\$; create event trigger ensure_rls on ddl_command_end when tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO') execute function public.rls_auto_enable(); grant execute on function public.rls_auto_enable() to anon, authenticated, service_role"
out=$(land_rows -c "begin" -c "$ENSURE_RLS" -f "$LAND_VERIFY" -c "rollback")
echo "$out" | grep -q '^00 ALL CHECKS|t|' && echo "$out" | grep -q '^21 callable functions.*|t|abandon_job_shift, buy_land_plot, buy_shop_item, claim_job_shift, create_character, get_land_plots, get_my_jobs, get_my_land, get_player_profiles, get_shop, mp_my_player_id, start_job_shift$' \
  && echo "$out" | grep -q '^i2 trigger functions.*|t|rls_auto_enable (event_trigger, event trigger: ensure_rls)$' \
  || { echo "$out"; echo "FAIL: land check does not accept the production ensure_rls / rls_auto_enable helper, or does not list it in i2" >&2; exit 1; }
echo "PASS: with the production-like ensure_rls / rls_auto_enable() helper the check passes, and i2 lists it"
# Why excluding trigger functions from check 21 is sound: even with EXECUTE granted, nobody can call one.
for role in anon authenticated; do
  r=$(psql -X -At -v VERBOSITY=verbose -c "begin" -c "$ENSURE_RLS" -c "set role $role" -c "select public.rls_auto_enable()" -c "rollback" 2>&1 | grep -oE 'ERROR: +[0-9A-Z]{5}' | grep -oE '[0-9A-Z]{5}$' || true)
  [ "$r" = "0A000" ] || { echo "FAIL: $role calling rls_auto_enable() directly should fail with 0A000, got '$r'" >&2; exit 1; }
done
echo "PASS: anon and authenticated cannot call rls_auto_enable() directly (0A000: trigger functions can only be called as triggers)"
# With the helper present, genuinely callable extras and changed land grants must still fail.
n=0
while IFS= read -r bad; do
  [ -n "$bad" ] || continue
  r=$(land_ok -c "begin" -c "$ENSURE_RLS" -c "$bad" -f "$LAND_VERIFY" -c "rollback")
  [ "$r" = "f" ] || { echo "FAIL: with ensure_rls present, land check did not catch: $bad" >&2; exit 1; }
  n=$((n+1))
done <<'BAD'
create function public.leak_players() returns setof public.players language sql security definer set search_path = '' as $$ select * from public.players $$
create function public.anon_only() returns int language sql as $$ select 1 $$; revoke all on function public.anon_only() from public, authenticated; grant execute on function public.anon_only() to anon
grant execute on function public.buy_land_plot(text, uuid) to anon
revoke execute on function public.get_my_land() from authenticated
grant execute on function public.economy_append_only() to authenticated
grant execute on function public.ledger_check_balanced() to anon
BAD
echo "PASS: with the helper present the check still fails on $n changes (extra callable function, anon-only function, land RPC grants, client EXECUTE on our trigger functions)"
# A trigger function with client EXECUTE is not counted as callable, but is never hidden: i2 lists it.
out=$(land_rows -c "begin" -c "create function public.some_trigger_fn() returns trigger language plpgsql as \$f\$ begin return null; end \$f\$" -f "$LAND_VERIFY" -c "rollback")
echo "$out" | grep -q '^i2 trigger functions.*|t|some_trigger_fn (trigger)$' || { echo "$out"; echo "FAIL: i2 does not list an extra trigger function with client EXECUTE" >&2; exit 1; }
echo "PASS: an extra trigger function with client EXECUTE is reported in i2"

echo "▶ running SQL tests"
for f in "$ROOT"/supabase/tests/*.test.sql; do
  psql -q -v ON_ERROR_STOP=1 -f "$f" 2>&1 | sed -n 's/^psql:[^ ]* NOTICE:  //p; s/^NOTICE:  //p; /^==/p; /FAIL/p; /ERROR/p'
done

echo "▶ multiplayer migration: fail-safe re-apply and rollback script"
MP_MIGRATION="$ROOT/supabase/migrations/20261019000000_phase3_1_multiplayer.sql"
MP_DOWN="$ROOT/supabase/rollback/20261019000000_phase3_1_multiplayer_down.sql"
mp_state() { psql -X -At -c "select (select count(*) from pg_policies where schemaname = 'realtime' and policyname like 'mp:%') || '/' || (select count(*) from pg_proc where proname in ('mp_my_player_id', 'get_player_profiles') and pronamespace = 'public'::regnamespace) || '/' || (select count(*) from pg_policies where schemaname = 'public') || '/' || (select count(*) || ':' || sum(cash) from public.players)"; }
before=$(mp_state)
[ "${before%%/*}" = "3" ] || { echo "FAIL: expected 3 mp policies before the checks, got $before" >&2; exit 1; }
# Applying the migration a second time must fail (no silent replace) and change nothing.
if psql -X -q -v ON_ERROR_STOP=1 -c "begin" -f "$MP_MIGRATION" -c "commit" >/dev/null 2>&1; then echo "FAIL: re-applying the multiplayer migration succeeded" >&2; exit 1; fi
[ "$(mp_state)" = "$before" ] || { echo "FAIL: failed re-apply changed something: $before -> $(mp_state)" >&2; exit 1; }
echo "PASS: re-applying the migration fails and changes nothing ($before)"
# The rollback script removes exactly the multiplayer objects; Phase 1 policies and data stay.
after=$(psql -X -At -v ON_ERROR_STOP=1 -c "begin" -f "$MP_DOWN" -c "select (select count(*) from pg_policies where schemaname = 'realtime' and policyname like 'mp:%') || '/' || (select count(*) from pg_proc where proname in ('mp_my_player_id', 'get_player_profiles') and pronamespace = 'public'::regnamespace) || '/' || (select count(*) from pg_policies where schemaname = 'public') || '/' || (select count(*) || ':' || sum(cash) from public.players)" -c "rollback" | grep -E '^[0-9]+/')
expected="0/0/${before#*/*/}"
[ "$after" = "$expected" ] || { echo "FAIL: rollback script left $after, expected $expected" >&2; exit 1; }
echo "PASS: rollback script removes the 3 policies and 2 functions only; Phase 1 policies and player data unchanged ($after)"
[ "$(mp_state)" = "$before" ] || { echo "FAIL: rollback test leaked: $(mp_state)" >&2; exit 1; }

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

echo "▶ land (Phase 3.3A): fail-safe re-apply and rollback script"
LAND_MIGRATION="$ROOT/supabase/migrations/20261020000000_phase3_3a_land.sql"
LAND_DOWN="$ROOT/supabase/rollback/20261020000000_phase3_3a_land_down.sql"
land_state() { psql -X -At -c "select (select count(*) from pg_class where relnamespace = 'public'::regnamespace and relname in ('land_plots', 'economy_transactions', 'ledger_entries', 'economic_requests')) || '/' || (select count(*) from pg_proc where pronamespace = 'public'::regnamespace and proname in ('buy_land_plot', 'get_land_plots', 'get_my_land', 'ledger_check_balanced', 'economy_append_only')) || '/' || (select count(*) from pg_policies) || '/' || (select count(*) from pg_proc where pronamespace = 'public'::regnamespace and proname in ('create_character', 'get_player_profiles', 'mp_my_player_id')) || '/' || (select count(*) || ':' || sum(cash) from public.players) || '/' || (select count(*) from public.inventory_items)" | grep -E '^[0-9]+/'; }
lbefore=$(land_state)
[ "${lbefore%%/*}" = "4" ] || { echo "FAIL: expected the 4 land tables, got $lbefore" >&2; exit 1; }
if psql -X -q -v ON_ERROR_STOP=1 -c "begin" -f "$LAND_MIGRATION" -c "commit" >/dev/null 2>&1; then echo "FAIL: re-applying the land migration succeeded" >&2; exit 1; fi
[ "$(land_state)" = "$lbefore" ] || { echo "FAIL: failed land re-apply changed something: $lbefore -> $(land_state)" >&2; exit 1; }
echo "PASS: re-applying the land migration fails and changes nothing ($lbefore)"
# Purchases exist now (A and B bought plots), so the rollback must refuse unless told to refund.
if psql -X -q -v ON_ERROR_STOP=1 -c "begin" -f "$LAND_DOWN" -c "commit" >/dev/null 2>&1; then echo "FAIL: land rollback ran without ogs.rollback_refund while purchases exist" >&2; exit 1; fi
[ "$(land_state)" = "$lbefore" ] || { echo "FAIL: refused land rollback changed something" >&2; exit 1; }
echo "PASS: land rollback refuses to run while purchases exist, and changes nothing"
# (The refund path needs the 3.4A tables gone first, so it is tested in the "upgrade path" section at
# the end, on a database in the 3.3A state.)

echo "▶ jobs and shops (Phase 3.4A): fail-safe re-apply and rollback script"
ECON_MIGRATION="$ROOT/supabase/migrations/20261023000000_phase3_4a_jobs_shops.sql"
ECON_DOWN="$ROOT/supabase/rollback/20261023000000_phase3_4a_jobs_shops_down.sql"
econ_state() { psql -X -At -c "select (select count(*) from pg_class where relnamespace = 'public'::regnamespace and relname in ('jobs', 'job_shifts', 'shop_items')) || '/' || (select count(*) from pg_proc where pronamespace = 'public'::regnamespace and proname in ('start_job_shift', 'claim_job_shift', 'abandon_job_shift', 'get_my_jobs', 'get_shop', 'buy_shop_item')) || '/' || (select count(*) || ':' || sum(cash) from public.players) || '/' || (select count(*) from public.economy_transactions) || '/' || (select count(*) from public.job_shifts) || '/' || (select sum(quantity) from public.inventory_items)" | grep -E '^[0-9]+/'; }
ebefore=$(econ_state)
[ "${ebefore%%/*}" = "3" ] || { echo "FAIL: expected the 3 job/shop tables, got $ebefore" >&2; exit 1; }
if psql -X -q -v ON_ERROR_STOP=1 -c "begin" -f "$ECON_MIGRATION" -c "commit" >/dev/null 2>&1; then echo "FAIL: re-applying the jobs/shops migration succeeded" >&2; exit 1; fi
[ "$(econ_state)" = "$ebefore" ] || { echo "FAIL: failed jobs/shops re-apply changed something: $ebefore -> $(econ_state)" >&2; exit 1; }
echo "PASS: re-applying the jobs/shops migration fails and changes nothing ($ebefore)"
# Shifts and shop purchases exist now (SQL tests), so the rollback must refuse and change nothing.
out=$(psql -X -q -v ON_ERROR_STOP=1 -c "begin" -f "$ECON_DOWN" -c "commit" 2>&1) && { echo "FAIL: jobs/shops rollback ran while shifts and purchases exist" >&2; exit 1; }
echo "$out" | grep -q 'Refusing to roll back Phase 3.4A' || { echo "$out"; echo "FAIL: jobs/shops rollback failed for an unexpected reason" >&2; exit 1; }
[ "$(econ_state)" = "$ebefore" ] && [ "$(land_state)" = "$lbefore" ] || { echo "FAIL: refused jobs/shops rollback changed something" >&2; exit 1; }
echo "PASS: jobs/shops rollback refuses while shifts or job/shop money exist, and changes nothing"

echo "▶ land verification script after purchases (players A and B bought plots in the SQL tests)"
out=$(land_rows -c "begin transaction read only" -f "$LAND_VERIFY" -c "rollback")
echo "$out" | grep -q '^00 ALL CHECKS|t|' && echo "$out" | grep -q '^i1 fresh install.*|t|no:' \
  || { echo "$out"; echo "FAIL: land check does not pass after legitimate purchases" >&2; exit 1; }
# It reports counts only: no player ids, user ids, transaction ids or character names.
if echo "$out" | grep -qiE '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|Ọlá|Bayo|Adéyẹmí'; then echo "FAIL: land check output contains ids or names" >&2; exit 1; fi
echo "PASS: land check passes after purchases (fresh install = no) and its output holds no ids or names"
n=0
while IFS= read -r bad; do
  [ -n "$bad" ] || continue
  r=$(land_ok -c "begin" -c "$bad" -f "$LAND_VERIFY" -c "rollback")
  [ "$r" = "f" ] || { echo "FAIL: land check did not catch: $bad" >&2; exit 1; }
  n=$((n+1))
done <<'BAD'
update public.land_plots set owner_player_id = (select id from public.players order by id limit 1), acquired_at = now() where plot_key = 'kuto-12'
update public.land_plots set acquired_at = null, owner_player_id = null where plot_key = 'kuto-07'
with t as (insert into public.economy_transactions (kind, player_id, plot_id, amount) select 'land_purchase', p.id, l.id, 1000 from public.players p, public.land_plots l order by p.id, l.plot_key limit 1 returning id) insert into public.ledger_entries (transaction_id, account, amount) select id, 'game:land-sales', 1000 from t
update public.players set cash = cash + 1 where id = (select player_id from public.ledger_entries where account = 'player' order by id limit 1)
alter table public.job_shifts disable trigger job_shifts_guard; update public.job_shifts set status = 'abandoned', transaction_id = null where id = (select id from public.job_shifts where status = 'paid' order by id limit 1)
alter table public.job_shifts disable trigger job_shifts_guard; update public.job_shifts set status = 'paid', finished_at = now(), transaction_id = (select id from public.economy_transactions where kind = 'shop_purchase' order by id limit 1) where id = (select id from public.job_shifts where status = 'abandoned' order by id limit 1)
drop index public.job_shifts_one_active_idx; insert into public.job_shifts (player_id, job_key, pay, ends_at) select id, 'buka-helper', 1500, now() + interval '2 minutes' from public.players order by id limit 1; insert into public.job_shifts (player_id, job_key, pay, ends_at) select id, 'buka-helper', 1500, now() + interval '2 minutes' from public.players order by id limit 1
BAD
echo "PASS: economy check fails on $n inconsistent ownership/ledger/shift states (plot owned without a purchase, purchase without an owner, unbalanced transaction, cash changed outside the ledger, paid shift without its wage, shift 'paid' by a shop purchase, two shifts at once)"

echo "▶ account deletion pre-check (supabase/verify/account_deletion_precheck.sql)"
PRECHECK="$ROOT/supabase/verify/account_deletion_precheck.sql"
precheck() { # $1 = user id; remaining args are extra psql -c statements run BEFORE the check (in the same transaction)
  local uid=$1 sql; shift
  sql=$(sed "s/00000000-0000-0000-0000-000000000000/$uid/" "$PRECHECK")
  grep -q "$uid" <<<"$sql" || { echo "FAIL: could not fill the user id into the pre-check" >&2; exit 1; }
  if [ $# -eq 0 ]; then psql -X -q -At -F'|' -v ON_ERROR_STOP=1 -c "begin transaction read only" -c "$sql" -c "rollback"
  else psql -X -q -At -F'|' -v ON_ERROR_STOP=1 -c "begin" "$@" -c "$sql" -c "rollback"; fi
}
r=$(precheck 00000000-0000-4000-a000-00000000000a)
case "$r" in "t|t|1|1|1|1|0|f|BLOCKED: this player owns 1 plot(s) of land."*) ;; *) echo "FAIL: pre-check for a land owner: $r" >&2; exit 1 ;; esac
echo "PASS: pre-check for a land owner (read-only): deletable = false, 'BLOCKED: this player owns 1 plot(s) of land…'"
# (C and D got characters in the concurrency tests above, so fresh users are made inside rolled-back transactions.)
r=$(precheck 00000000-0000-4000-a000-0000000000f0 -c "insert into auth.users (id, email) values ('00000000-0000-4000-a000-0000000000f0', 'fola@test.local')" | tail -1)
case "$r" in "t|f|0|0|0|0|0|t|OK: no land and no transaction history."*) ;; *) echo "FAIL: pre-check for a user without a character: $r" >&2; exit 1 ;; esac
r=$(precheck 00000000-0000-4000-a000-00000000000e -c "insert into auth.users (id, email) values ('00000000-0000-4000-a000-00000000000e', 'eko@test.local')" \
     -c "set role authenticated" -c "select tests.claims('00000000-0000-4000-a000-00000000000e')" \
     -c "select public.create_character('Eko Bello', '{\"body\":\"masc\",\"skin\":\"brown\",\"headwear\":\"cap\",\"outfit\":\"palm\"}')" -c "reset role" | tail -1)
case "$r" in "t|t|0|0|0|0|0|t|OK: no land"*) ;; *) echo "FAIL: pre-check for a player without land: $r" >&2; exit 1 ;; esac
r=$(precheck 00000000-0000-4000-a000-0000000000ff)
case "$r" in "f|f|0|0|0|0|0|f|No such user"*) ;; *) echo "FAIL: pre-check for an unknown user: $r" >&2; exit 1 ;; esac
echo "PASS: pre-check says deletable for a player without land and for a user without a character, and 'No such user' for an unknown id"
# A player whose only history is an abandoned work shift (no money moved) is blocked by job_shifts' foreign key.
r=$(precheck 00000000-0000-4000-a000-00000000000e -c "insert into auth.users (id, email) values ('00000000-0000-4000-a000-00000000000e', 'eko@test.local')" \
     -c "set role authenticated" -c "select tests.claims('00000000-0000-4000-a000-00000000000e')" \
     -c "select public.create_character('Eko Bello', '{\"body\":\"masc\",\"skin\":\"brown\",\"headwear\":\"cap\",\"outfit\":\"palm\"}')" \
     -c "select public.start_job_shift('buka-helper')" -c "select public.abandon_job_shift()" -c "reset role" | tail -1)
case "$r" in "t|t|0|0|0|0|1|f|BLOCKED: this player has 1 work shift(s) on record"*) ;; *) echo "FAIL: pre-check for a player with an abandoned shift: $r" >&2; exit 1 ;; esac
del=$(psql -X -At -v VERBOSITY=verbose -c "begin" -c "insert into auth.users (id, email) values ('00000000-0000-4000-a000-00000000000e', 'eko@test.local')" \
     -c "set role authenticated" -c "select tests.claims('00000000-0000-4000-a000-00000000000e')" \
     -c "select public.create_character('Eko Bello', '{\"body\":\"masc\",\"skin\":\"brown\",\"headwear\":\"cap\",\"outfit\":\"palm\"}')" \
     -c "select public.start_job_shift('buka-helper')" -c "select public.abandon_job_shift()" -c "reset role" \
     -c "delete from auth.users where id = '00000000-0000-4000-a000-00000000000e'" -c "rollback" 2>&1 | grep -oE 'ERROR: +[0-9A-Z]{5}' | grep -oE '[0-9A-Z]{5}$' || true)
[ "$del" = "23503" ] || { echo "FAIL: deleting a user with a shift should be refused with 23503, got '$del'" >&2; exit 1; }
echo "PASS: pre-check blocks a player whose only history is an abandoned shift, matching the database (deleting them fails with 23503)"

echo "▶ land (Phase 3.3A): concurrency tests"
# Test-only plots (as postgres, disposable database only) so the 12 seeded plots stay as the SQL tests left them.
psql -X -q -v ON_ERROR_STOP=1 -c "insert into public.land_plots (plot_key, location_id, tier, price, tile_x, tile_y, width, depth) select format('test-%s', lpad(i::text, 2, '0')), 'kuto-street', 'basic', 25000, 0, 0, 1, 1 from generate_series(1, 20) i"
LAND_USERS=""
for n in $(seq 10 39); do LAND_USERS="$LAND_USERS 00000000-0000-4000-b000-0000000000$n"; done
psql -X -q -v ON_ERROR_STOP=1 -c "insert into auth.users (id, email) select u::uuid, u || '@test.local' from unnest(string_to_array(trim('$LAND_USERS'), ' ')) u"
for u in $LAND_USERS; do
  s=$(as_user "$u" "select public.create_character('Land Buyer', '$AVATAR');")
  [ -z "$s" ] || { echo "FAIL: could not create land test character for $u ($s)" >&2; exit 1; }
done
user() { echo "00000000-0000-4000-b000-0000000000$1"; }
# buy <user> <plot> <idempotency key>: prints "ok", "replay" or the SQLSTATE of the error.
buy() {
  out=$(psql -X -At -v VERBOSITY=verbose -c "set role authenticated; select tests.claims('$1');" -c "select public.buy_land_plot('$2', '$3')" 2>&1 || true) # errors are the result here, not a script failure
  code=$(echo "$out" | grep -oE 'ERROR: +[0-9A-Z]{5}' | grep -oE '[0-9A-Z]{5}$' || true)
  if [ -n "$code" ]; then echo "$code"; elif echo "$out" | grep -q '"replayed": true'; then echo replay; elif echo "$out" | grep -q '"replayed": false'; then echo ok; else echo "?$out"; fi
}
# overlap <user1> <plot1> <key1> <user2> <plot2> <key2>: request 1 runs in a transaction that stays open
# for 2 s after buying; request 2 starts 0.7 s in. Prints request 2's result and whether it had to wait.
overlap() {
  ( psql -X -q -c "begin; set local role authenticated; select tests.claims('$1'); select public.buy_land_plot('$2', '$3'); select pg_sleep(2); commit;" >/dev/null 2>&1 ) &
  sleep 0.7
  t0=$(date +%s%N); r=$(buy "$4" "$5" "$6"); t1=$(date +%s%N)
  wait
  if [ $(( (t1 - t0) / 1000000 )) -ge 900 ]; then echo "$r waited"; else echo "$r nowait"; fi
}
owner_of() { psql -Atqc "select coalesce(p.user_id::text, 'none') from public.land_plots l left join public.players p on p.id = l.owner_player_id where l.plot_key = '$1'"; }
cash_of() { psql -Atqc "select cash from public.players where user_id = '$1'"; }
txs_for() { psql -Atqc "select count(*) from public.economy_transactions t join public.land_plots l on l.id = t.plot_id where l.plot_key = '$1'"; }

# (c) Two players, overlapping: the second must wait for the first's plot lock, then see it sold.
r=$(overlap "$(user 10)" test-01 "$(cat /proc/sys/kernel/random/uuid)" "$(user 11)" test-01 "$(cat /proc/sys/kernel/random/uuid)")
[ "$r" = "OG409 waited" ] && [ "$(owner_of test-01)" = "$(user 10)" ] && [ "$(txs_for test-01)" = "1" ] && [ "$(cash_of "$(user 10)")" = "25000" ] && [ "$(cash_of "$(user 11)")" = "50000" ] \
  || { echo "FAIL: overlapping purchase of one plot — second got '$r', owner $(owner_of test-01), txs $(txs_for test-01)" >&2; exit 1; }
echo "PASS: overlapping purchases of one plot — the second waited on the row lock and got OG409; one owner, one charge"

# (d) Eight different players buy the same plot at the same moment: exactly one wins.
tmp=$(mktemp -d)
for n in $(seq 12 19); do buy "$(user $n)" test-02 "$(cat /proc/sys/kernel/random/uuid)" >"$tmp/$n" & done
wait
ok=$(cat "$tmp"/* | grep -c '^ok$' || true); sold=$(cat "$tmp"/* | grep -c '^OG409$' || true)
winner=$(owner_of test-02); total=$(psql -Atqc "select sum(cash) from public.players where user_id::text like '00000000-0000-4000-b000-0000000000%' and right(user_id::text, 2)::int between 12 and 19")
results=$(cat "$tmp"/* | sort | uniq -c | tr -s ' \n' ' '); rm -rf "$tmp"
[ "$ok" = "1" ] && [ "$sold" = "7" ] && [ "$(txs_for test-02)" = "1" ] && [ "$total" = "$((8 * 50000 - 25000))" ] && [ "$(cash_of "$winner")" = "25000" ] \
  || { echo "FAIL: 8 players racing for one plot — ok=$ok sold=$sold txs=$(txs_for test-02) total=$total results:$results" >&2; exit 1; }
echo "PASS: 8 players buying one plot at once — 1 succeeded, 7 got OG409; charged once (₦25,000), the winner owns it"

# (e) One player sends the same request (same idempotency key) 8 times at once: one charge, 7 replays.
key=$(cat /proc/sys/kernel/random/uuid); tmp=$(mktemp -d)
for n in $(seq 1 8); do buy "$(user 20)" test-03 "$key" >"$tmp/$n" & done
wait
ok=$(cat "$tmp"/* | grep -c '^ok$' || true); rep=$(cat "$tmp"/* | grep -c '^replay$' || true); rm -rf "$tmp"
[ "$ok" = "1" ] && [ "$rep" = "7" ] && [ "$(cash_of "$(user 20)")" = "25000" ] && [ "$(txs_for test-03)" = "1" ] \
  || { echo "FAIL: 8 parallel retries — ok=$ok replay=$rep cash=$(cash_of "$(user 20)")" >&2; exit 1; }
echo "PASS: 8 simultaneous retries with one idempotency key — 1 purchase, 7 replays; charged once"

# (e2) The same retry overlapping a purchase that has not committed yet: it waits, then gets the replay.
key=$(cat /proc/sys/kernel/random/uuid)
r=$(overlap "$(user 21)" test-04 "$key" "$(user 21)" test-04 "$key")
[ "$r" = "replay waited" ] && [ "$(cash_of "$(user 21)")" = "25000" ] && [ "$(txs_for test-04)" = "1" ] \
  || { echo "FAIL: overlapping retry — got '$r', cash $(cash_of "$(user 21)")" >&2; exit 1; }
echo "PASS: a retry overlapping the original waited on the player lock, then replayed it; charged once"

# (f) One player with ₦50,000 fires 6 purchases of ₦25,000 plots at once: exactly two succeed, never below ₦0.
tmp=$(mktemp -d); n=0
for plot in test-05 test-06 test-07 test-05 test-06 test-07; do n=$((n+1)); buy "$(user 22)" "$plot" "$(cat /proc/sys/kernel/random/uuid)" >"$tmp/$n" & done
wait
ok=$(cat "$tmp"/* | grep -c '^ok$' || true); bad=$(cat "$tmp"/* | grep -vcE '^(ok|OG402|OG409)$' || true); rm -rf "$tmp"
[ "$ok" = "2" ] && [ "$bad" = "0" ] && [ "$(cash_of "$(user 22)")" = "0" ] \
  || { echo "FAIL: parallel spending — ok=$ok unexpected=$bad cash=$(cash_of "$(user 22)")" >&2; exit 1; }
echo "PASS: 6 simultaneous purchases with cash for 2 — exactly 2 succeeded, the rest OG402/OG409; balance ₦0, never negative"

# Pre-ledger money: every character starts with ₦50,000, except the 3.4A SQL test's fixture P, whose
# cash was set to ₦100 before any ledger activity (so the total is 49,900 lower).
PRE_LEDGER="50000 * (select count(*) from public.players) - 49900"
conserve=$(psql -Atqc "select (select bool_and(cash >= 0) from public.players) and (select sum(amount) = 0 from public.ledger_entries) and (select sum(cash) from public.players) + (select sum(amount) from public.ledger_entries where account <> 'player') = $PRE_LEDGER and not exists (select 1 from (select transaction_id, sum(amount) s, count(*) c from public.ledger_entries group by transaction_id) t where s <> 0 or c <> 2) and not exists (select 1 from public.players p join lateral (select balance_after from public.ledger_entries e where e.player_id = p.id order by e.id desc limit 1) l on true where l.balance_after <> p.cash)")
[ "$conserve" = "t" ] || { echo "FAIL: money not conserved after the concurrency tests" >&2; exit 1; }
echo "PASS: after all races: no negative cash, every transaction balances, cash + game accounts = pre-ledger total, ledger balances match players.cash"

echo "▶ land (Phase 3.3A): mutation checks (each protection removed must make a check fail)"
BUY_SIG='public.buy_land_plot(text,uuid)'
buy_md5() { psql -Atqc "select md5(prosrc) from pg_proc where oid = '$BUY_SIG'::regprocedure"; }
orig_md5=$(buy_md5)
ORIG_BUY=$(mktemp)
psql -X -At -c "select pg_get_functiondef('$BUY_SIG'::regprocedure)" >"$ORIG_BUY"
trap 'rm -f "$ORIG_BUY"; cleanup' EXIT
# SQL that replaces buy_land_plot with a copy of its body where each OLD text is replaced by NEW.
# Arguments: OLD1 NEW1 [OLD2 NEW2 ...]. Every OLD must occur EXACTLY ONCE in the reviewed body,
# otherwise the DO block raises "mutation did not apply" and nothing is replaced: a pattern that
# drifted out of date can never silently turn into a no-op (or half-applied) mutant.
mutate() {
  local checks="" expr="src"
  while [ $# -ge 2 ]; do
    checks="$checks if (length(src) - length(replace(src, \$m\$$1\$m\$, ''))) / greatest(length(\$m\$$1\$m\$), 1) <> 1 then raise exception 'mutation did not apply: pattern must occur exactly once: %', \$m\$$1\$m\$; end if;"
    expr="replace($expr, \$m\$$1\$m\$, \$m\$$2\$m\$)"
    shift 2
  done
  echo "do \$d\$ declare src text; begin select prosrc into src from pg_proc where oid = '$BUY_SIG'::regprocedure; $checks execute format('create or replace function public.buy_land_plot(p_plot_key text, p_idempotency_key uuid) returns jsonb language plpgsql security definer set search_path = %L as %L', '', $expr); end \$d\$"
}
# probe <user1> <user2> <plot>: single-connection checks as plain SQL. Each check raises "FAIL: <what>"
# when its protection is missing, so a caught mutant names the protection that caught it.
probe_sql() {
  cat <<SQL
set role authenticated;
select tests.claims('$1');
do \$p\$ declare r jsonb; begin
  r := public.buy_land_plot('$3', '22222222-2222-4222-8222-222222222222');
  begin
    r := public.buy_land_plot('$3', '22222222-2222-4222-8222-222222222222');
  exception when others then
    raise exception 'FAIL: retry was not replayed (got %: %)', sqlstate, sqlerrm;
  end;
  if not (r ->> 'replayed')::boolean then raise exception 'FAIL: retry was not replayed (charged again)'; end if;
end \$p\$;
select tests.claims('$2');
select tests.expect_error(\$\$select public.buy_land_plot('$3', gen_random_uuid())\$\$, 'OG409', 'second buyer (with cash) refused');
reset role;
update public.players set cash = 0 where user_id = '$2';
set role authenticated;
select tests.expect_error(\$\$select public.buy_land_plot('test-20', gen_random_uuid())\$\$, 'OG402', 'buyer without cash refused');
select tests.ok((select cash = 0 from public.players), 'buyer without cash still has ₦0');
SQL
}
# run_probe [OLD NEW ...]: applies the mutation (if any) and the probe in a rolled-back transaction.
# Prints "pass", "unapplied: <why>" (the mutation could not be applied) or "fail: <first error line>".
run_probe() {
  local out
  out=$( { echo "begin;"; [ $# -gt 0 ] && echo "$(mutate "$@");"; probe_sql "$(user 23)" "$(user 24)" test-08; echo "rollback;"; } | psql -X -q -v ON_ERROR_STOP=1 2>&1 )
  if echo "$out" | grep -q 'mutation did not apply'; then echo "unapplied: $(echo "$out" | grep -m1 'mutation did not apply' | sed 's/^.*ERROR: *//')"
  elif echo "$out" | grep -qE 'ERROR|FAIL'; then echo "fail: $(echo "$out" | grep -m1 -E 'ERROR|FAIL' | sed 's/^.*ERROR: *//')"
  else echo pass; fi
}
# check_mutation <label> <expected failure text> OLD NEW [...]: the mutant must be applied AND be caught
# with exactly the expected reason. Anything else (unapplied, not caught, caught by an unrelated error)
# is a hard failure of the test run.
check_mutation() {
  local label=$1 expected=$2 r; shift 2
  r=$(run_probe "$@")
  case "$r" in
    unapplied:*) echo "FAIL: mutation '$label' did not apply (${r#unapplied: }): update the mutation, it no longer matches buy_land_plot" >&2; exit 1 ;;
    pass) echo "FAIL: removing $label was NOT caught" >&2; exit 1 ;;
  esac
  case "${r#fail: }" in
    *"$expected"*) echo "PASS: removing $label is caught: ${r#fail: }" | cut -c1-220 ;;
    *) echo "FAIL: removing $label failed for an unexpected reason: '${r#fail: }' (expected '$expected')" >&2; exit 1 ;;
  esac
}
[ "$(run_probe)" = "pass" ] || { echo "FAIL: mutation probe does not pass on the real function: $(run_probe)" >&2; exit 1; }
echo "PASS: the mutation probe passes on the reviewed buy_land_plot"

IDEM=('where player_id = v_player.id and idempotency_key = p_idempotency_key;' 'where false;')
check_mutation "the idempotency lookup" "FAIL: retry was not replayed (got OG409" "${IDEM[@]}"
check_mutation "the already-sold checks" "FAIL: second buyer (with cash) refused — expected error OG409, but it succeeded" \
  'if v_plot.owner_player_id is not null then' 'if false then' \
  'where id = v_plot.id and owner_player_id is null;' 'where id = v_plot.id;'
check_mutation "the balance checks" "FAIL: buyer without cash refused — expected OG402, got 23514" \
  'if v_player.cash < v_price then' 'if false then' \
  'where id = v_player.id and cash >= v_price' 'where id = v_player.id'
echo "  (with the balance checks removed, players.cash CHECK (cash >= 0) still refuses the sale: no negative balance even then)"

# The harness itself: a pattern that is not in the function, a pattern that is only partly present
# (one of two pairs), and a real mutant caught for a different reason must each FAIL the run.
( check_mutation "an unmatched pattern (self-test)" "anything" 'this text is not in buy_land_plot' 'x' ) >/dev/null 2>&1 \
  && { echo "FAIL: harness self-test: an unmatched mutation pattern did not fail the run" >&2; exit 1; }
( check_mutation "a half-matched mutation (self-test)" "anything" "${IDEM[@]}" 'nor is this text' 'y' ) >/dev/null 2>&1 \
  && { echo "FAIL: harness self-test: a half-matched mutation did not fail the run" >&2; exit 1; }
( check_mutation "the idempotency lookup (self-test, wrong reason)" "FAIL: buyer without cash refused" "${IDEM[@]}" ) >/dev/null 2>&1 \
  && { echo "FAIL: harness self-test: a mutant caught for the wrong reason did not fail the run" >&2; exit 1; }
[ "$(run_probe 'this text is not in buy_land_plot' 'x' | cut -d: -f1)" = "unapplied" ] \
  || { echo "FAIL: harness self-test: unmatched pattern not reported as unapplied" >&2; exit 1; }
echo "PASS: harness self-test: unmatched, half-matched and wrong-reason mutations each fail the run"
[ "$(buy_md5)" = "$orig_md5" ] || { echo "FAIL: a mutation leaked into the real function" >&2; exit 1; }

# Row locks need two connections, so these mutants are committed, probed, then the reviewed function is restored.
lock_mutant() { psql -X -q -v ON_ERROR_STOP=1 -c "$(mutate "$@")" >/dev/null 2>&1 || { echo "FAIL: lock mutation did not apply ($1): update it, it no longer matches buy_land_plot" >&2; exit 1; }; }
restore() { psql -X -q -v ON_ERROR_STOP=1 -f "$ORIG_BUY"; [ "$(buy_md5)" = "$orig_md5" ] || { echo "FAIL: could not restore buy_land_plot" >&2; exit 1; }; }
# Plot lock AND the conditional update removed: the overlap race must catch a double sale.
lock_mutant 'where plot_key = p_plot_key for update;' 'where plot_key = p_plot_key;' 'where id = v_plot.id and owner_player_id is null;' 'where id = v_plot.id;'
r=$(overlap "$(user 25)" test-09 "$(cat /proc/sys/kernel/random/uuid)" "$(user 26)" test-09 "$(cat /proc/sys/kernel/random/uuid)"); restore
[ "$r" = "ok waited" ] && [ "$(txs_for test-09)" = "2" ] || { echo "FAIL: overlap test did not catch the missing plot lock (got '$r', txs $(txs_for test-09))" >&2; exit 1; }
echo "PASS: removing the plot row lock (and the conditional update) is caught: the overlap test sees a double sale"
# Plot lock removed but the conditional update kept: still safe (defence in depth).
lock_mutant 'where plot_key = p_plot_key for update;' 'where plot_key = p_plot_key;'
r=$(overlap "$(user 27)" test-10 "$(cat /proc/sys/kernel/random/uuid)" "$(user 28)" test-10 "$(cat /proc/sys/kernel/random/uuid)"); restore
[ "$r" = "OG409 waited" ] && [ "$(txs_for test-10)" = "1" ] || { echo "FAIL: without the plot lock the conditional update should still refuse (got '$r')" >&2; exit 1; }
echo "PASS: with only the plot lock removed, the conditional update alone still refuses the second sale (OG409)"
# Player lock removed: an overlapping retry is no longer answered from the first request; it waits on the
# plot lock instead and then sees its own purchase as a sale to someone (OG409).
lock_mutant 'where user_id = v_uid for update;' 'where user_id = v_uid;'
key=$(cat /proc/sys/kernel/random/uuid)
r=$(overlap "$(user 29)" test-11 "$key" "$(user 29)" test-11 "$key"); restore
[ "$r" = "OG409 waited" ] || { echo "FAIL: overlap retry test did not catch the missing player lock (got '$r', expected 'OG409 waited')" >&2; exit 1; }
echo "PASS: removing the player row lock is caught: an overlapping retry is no longer replayed (got OG409)"
rm -f "$ORIG_BUY"
[ "$(buy_md5)" = "$orig_md5" ] || { echo "FAIL: buy_land_plot differs from the reviewed version after the mutation checks" >&2; exit 1; }
echo "PASS: buy_land_plot restored to the reviewed version"

echo "▶ jobs and shops (Phase 3.4A): concurrency tests"
ECON_USERS=""
for n in $(seq 10 29); do ECON_USERS="$ECON_USERS 00000000-0000-4000-c000-0000000000$n"; done
psql -X -q -v ON_ERROR_STOP=1 -c "insert into auth.users (id, email) select u::uuid, u || '@test.local' from unnest(string_to_array(trim('$ECON_USERS'), ' ')) u"
for u in $ECON_USERS; do
  s=$(as_user "$u" "select public.create_character('Kuto Worker', '$AVATAR');")
  [ -z "$s" ] || { echo "FAIL: could not create jobs/shops test character for $u ($s)" >&2; exit 1; }
done
euser() { echo "00000000-0000-4000-c000-0000000000$1"; }
# rpc <user> <sql>: prints "ok", "replay" or the SQLSTATE of the error.
rpc() {
  out=$(psql -X -At -v VERBOSITY=verbose -c "set role authenticated; select tests.claims('$1');" -c "$2" 2>&1 || true) # errors are the result here
  code=$(echo "$out" | grep -oE 'ERROR: +[0-9A-Z]{5}' | grep -oE '[0-9A-Z]{5}$' || true)
  if [ -n "$code" ]; then echo "$code"; elif echo "$out" | grep -q '"replayed": true'; then echo replay; elif echo "$out" | grep -qi error; then echo "?$out"; else echo ok; fi
}
# race <n> <user> <sql>: runs the same call n times at once; prints the sorted result counts ("7 OG409 1 ok").
race() {
  local n=$1 u=$2 sql=$3 tmp i
  tmp=$(mktemp -d)
  for i in $(seq 1 "$n"); do rpc "$u" "$sql" >"$tmp/$i" & done
  wait
  cat "$tmp"/* | LC_ALL=C sort | uniq -c | awk '{printf "%s%s %s", (NR > 1 ? " " : ""), $1, $2}'; rm -rf "$tmp"
}
# overlap_rpc <user1> <sql1> <user2> <sql2>: call 1 runs in a transaction that stays open for 2 s; call 2
# starts 0.7 s in. Prints call 2's result and whether it had to wait.
overlap_rpc() {
  ( psql -X -q -c "begin; set local role authenticated; select tests.claims('$1'); $2; select pg_sleep(2); commit;" >/dev/null 2>&1 ) &
  sleep 0.7
  t0=$(date +%s%N); r=$(rpc "$3" "$4"); t1=$(date +%s%N)
  wait
  if [ $(( (t1 - t0) / 1000000 )) -ge 900 ]; then echo "$r waited"; else echo "$r nowait"; fi
}
finish_shift() { psql -X -q -v ON_ERROR_STOP=1 -c "select tests.finish_shift_now('$1')" >/dev/null; }
shifts_of() { psql -Atqc "select count(*) filter (where s.status = 'working') || '/' || count(*) filter (where s.status = 'paid') || '/' || count(*) filter (where s.status = 'abandoned') from public.job_shifts s join public.players p on p.id = s.player_id where p.user_id = '$1'"; }
payouts_of() { psql -Atqc "select count(*) from public.economy_transactions t join public.players p on p.id = t.player_id where p.user_id = '$1' and t.kind = 'job_payout'"; }
owned_of() { psql -Atqc "select coalesce(sum(x.quantity), 0) from public.inventory_items x join public.inventories i on i.id = x.inventory_id join public.players p on p.id = i.player_id where p.user_id = '$1' and x.item_key = '$2'"; }

# (g) Eight starts at once for one player: exactly one shift begins.
r=$(race 8 "$(euser 10)" "select public.start_job_shift('buka-helper')")
[ "$r" = "7 OG409 1 ok" ] && [ "$(shifts_of "$(euser 10)")" = "1/0/0" ] || { echo "FAIL: 8 parallel starts — $r, shifts $(shifts_of "$(euser 10)")" >&2; exit 1; }
echo "PASS: 8 simultaneous shift starts — 1 shift began, 7 got OG409"
# (h) Eight claims at once with different request ids: paid once.
finish_shift "$(euser 10)"
r=$(race 8 "$(euser 10)" "select public.claim_job_shift(gen_random_uuid())")
[ "$r" = "7 OG404 1 ok" ] && [ "$(cash_of "$(euser 10)")" = "51500" ] && [ "$(payouts_of "$(euser 10)")" = "1" ] && [ "$(shifts_of "$(euser 10)")" = "0/1/0" ] \
  || { echo "FAIL: 8 parallel claims — $r, cash $(cash_of "$(euser 10)"), payouts $(payouts_of "$(euser 10)")" >&2; exit 1; }
echo "PASS: 8 simultaneous claims of one finished shift — paid once (₦1,500), 7 got OG404"
# (i) The same claim (same request id) sent 8 times at once: paid once, 7 replays.
s=$(rpc "$(euser 11)" "select public.start_job_shift('buka-helper')"); [ "$s" = ok ] || { echo "FAIL: start for (i): $s" >&2; exit 1; }
finish_shift "$(euser 11)"
key=$(cat /proc/sys/kernel/random/uuid)
r=$(race 8 "$(euser 11)" "select public.claim_job_shift('$key')")
[ "$r" = "1 ok 7 replay" ] && [ "$(cash_of "$(euser 11)")" = "51500" ] && [ "$(payouts_of "$(euser 11)")" = "1" ] \
  || { echo "FAIL: 8 parallel claim retries — $r, cash $(cash_of "$(euser 11)")" >&2; exit 1; }
echo "PASS: 8 simultaneous retries of one claim — paid once, 7 replays"
# (j) Stopping a shift while its claim is still committing: the stop waits, then finds nothing to stop.
s=$(rpc "$(euser 12)" "select public.start_job_shift('pos-attendant')"); [ "$s" = ok ] || { echo "FAIL: start for (j): $s" >&2; exit 1; }
finish_shift "$(euser 12)"
r=$(overlap_rpc "$(euser 12)" "select public.claim_job_shift(gen_random_uuid())" "$(euser 12)" "select public.abandon_job_shift()")
[ "$r" = "OG404 waited" ] && [ "$(shifts_of "$(euser 12)")" = "0/1/0" ] && [ "$(cash_of "$(euser 12)")" = "54000" ] \
  || { echo "FAIL: stop overlapping a claim — got '$r', shifts $(shifts_of "$(euser 12)"), cash $(cash_of "$(euser 12)")" >&2; exit 1; }
echo "PASS: a stop overlapping a claim waited on the player lock, then got OG404; the shift stays paid (₦4,000)"
# (k) One player with ₦50,000 fires 8 purchases of ₦13,000 at once: exactly 3 go through, never below ₦0.
before=$(owned_of "$(euser 13)" adire-scarf)
r=$(race 8 "$(euser 13)" "select public.buy_shop_item('adire-scarf', 2, gen_random_uuid())")
[ "$r" = "5 OG402 3 ok" ] && [ "$(cash_of "$(euser 13)")" = "11000" ] && [ "$(owned_of "$(euser 13)" adire-scarf)" = "$((before + 6))" ] \
  || { echo "FAIL: parallel shopping — $r, cash $(cash_of "$(euser 13)"), scarves $(owned_of "$(euser 13)" adire-scarf)" >&2; exit 1; }
echo "PASS: 8 simultaneous ₦13,000 purchases with ₦50,000 — exactly 3 went through, 5 got OG402; ₦11,000 left, 6 scarves added"
# (l) The same purchase (same request id) sent 8 times at once: charged once, items added once.
key=$(cat /proc/sys/kernel/random/uuid); before=$(owned_of "$(euser 14)" puff-puff)
r=$(race 8 "$(euser 14)" "select public.buy_shop_item('puff-puff', 4, '$key')")
[ "$r" = "1 ok 7 replay" ] && [ "$(cash_of "$(euser 14)")" = "48800" ] && [ "$(owned_of "$(euser 14)" puff-puff)" = "$((before + 4))" ] \
  || { echo "FAIL: parallel purchase retries — $r, cash $(cash_of "$(euser 14)"), owned $(owned_of "$(euser 14)" puff-puff)" >&2; exit 1; }
echo "PASS: 8 simultaneous retries of one purchase — charged once (₦1,200), 4 items added once, 7 replays"
conserve=$(psql -Atqc "select (select bool_and(cash >= 0) from public.players) and (select sum(amount) = 0 from public.ledger_entries) and (select sum(cash) from public.players) + (select sum(amount) from public.ledger_entries where account <> 'player') = $PRE_LEDGER and not exists (select 1 from (select transaction_id, sum(amount) s, count(*) c from public.ledger_entries group by transaction_id) t where s <> 0 or c <> 2) and not exists (select 1 from public.players p join lateral (select balance_after from public.ledger_entries e where e.player_id = p.id order by e.id desc limit 1) l on true where l.balance_after <> p.cash)")
[ "$conserve" = "t" ] || { echo "FAIL: money not conserved after the jobs/shops concurrency tests" >&2; exit 1; }
out=$(land_rows -c "begin transaction read only" -f "$LAND_VERIFY" -c "rollback")
# The land tests above deliberately added 20 test plots (check 13) and committed a double sale of test-09
# with a mutant (check 15); every other row, including all ledger, shift and catalogue rows, must pass.
failing=$(echo "$out" | grep -E '^[0-9]+[a-z]? .*\|f\|' | grep -v '^00 ' | cut -d' ' -f1 | tr '\n' ' ')
[ "$failing" = "13 15 " ] && echo "$out" | grep -q '^00 ALL CHECKS|f|2 failing' || { echo "$out"; echo "FAIL: economy check after the jobs/shops races: unexpected failing rows '$failing'" >&2; exit 1; }
echo "PASS: after the job/shop races: no negative cash, every transaction balances, ledger matches cash; economy check rows all pass except the land tests' own test plots (13, 15)"

echo "▶ jobs and shops (Phase 3.4A): mutation checks (each protection removed must make a check fail)"
# fn_mutate <signature> <create header> OLD NEW [...]: SQL that replaces the function with a copy of its
# body where each OLD (which must occur exactly once) is replaced by NEW; otherwise it raises
# "mutation did not apply" and nothing changes (same rules as the buy_land_plot mutations above).
fn_mutate() {
  local sig=$1 header=$2 checks="" expr="src"; shift 2
  while [ $# -ge 2 ]; do
    checks="$checks if (length(src) - length(replace(src, \$m\$$1\$m\$, ''))) / greatest(length(\$m\$$1\$m\$), 1) <> 1 then raise exception 'mutation did not apply: pattern must occur exactly once: %', \$m\$$1\$m\$; end if;"
    expr="replace($expr, \$m\$$1\$m\$, \$m\$$2\$m\$)"
    shift 2
  done
  echo "do \$d\$ declare src text; begin select prosrc into src from pg_proc where oid = '$sig'::regprocedure; $checks execute format('create or replace function $header language plpgsql security definer set search_path = %L as %L', '', $expr); end \$d\$"
}
START_SIG='public.start_job_shift(text)';                 START_HDR='public.start_job_shift(p_job_key text) returns jsonb'
CLAIM_SIG='public.claim_job_shift(uuid)';                 CLAIM_HDR='public.claim_job_shift(p_idempotency_key uuid) returns jsonb'
SHOP_SIG='public.buy_shop_item(text,integer,uuid)';       SHOP_HDR='public.buy_shop_item(p_item_key text, p_quantity integer, p_idempotency_key uuid) returns jsonb'
econ_md5() { psql -Atqc "select md5(string_agg(prosrc, '|' order by oid)) from pg_proc where oid in ('$START_SIG'::regprocedure, '$CLAIM_SIG'::regprocedure, '$SHOP_SIG'::regprocedure)"; }
econ_orig=$(econ_md5)
# Probes: single-connection checks; each raises "FAIL: <what>" when its protection is missing.
probe_start() { U=$(euser 20); cat <<SQL
set role authenticated;
select tests.claims('$U');
select public.start_job_shift('buka-helper');
select tests.expect_error(\$\$select public.start_job_shift('pos-attendant')\$\$, 'OG409', 'second shift while working refused');
reset role;
insert into public.job_shifts (player_id, job_key, pay, started_at, ends_at, status, finished_at)
  select p.id, 'buka-helper', 1500, now() - interval '1 hour', now() - interval '58 minutes', 'abandoned', now() - interval '58 minutes'
    from public.players p, generate_series(1, 18) where p.user_id = '$U';
set role authenticated;
select public.abandon_job_shift();
select public.start_job_shift('buka-helper');
select public.abandon_job_shift();
select tests.expect_error(\$\$select public.start_job_shift('buka-helper')\$\$, 'OG429', 'shift over the daily limit refused');
SQL
}
probe_claim() { U=$(euser 21); cat <<SQL
set role authenticated;
select tests.claims('$U');
select public.start_job_shift('buka-helper');
select tests.expect_error(\$\$select public.claim_job_shift(gen_random_uuid())\$\$, 'OG425', 'claim before the shift ends refused');
reset role;
select tests.finish_shift_now('$U');
set role authenticated;
do \$p\$ declare r jsonb; begin
  r := public.claim_job_shift('33333333-3333-4333-8333-333333333333');
  begin
    r := public.claim_job_shift('33333333-3333-4333-8333-333333333333');
  exception when others then
    raise exception 'FAIL: claim retry was not replayed (got %: %)', sqlstate, sqlerrm;
  end;
  if not (r ->> 'replayed')::boolean then raise exception 'FAIL: claim retry was not replayed (paid again)'; end if;
end \$p\$;
select tests.expect_error(\$\$select public.claim_job_shift(gen_random_uuid())\$\$, 'OG404', 'second claim of a paid shift refused');
select tests.ok((select cash = 51500 from public.players), 'worker paid exactly once');
SQL
}
probe_shop() { U=$(euser 22); cat <<SQL
set role authenticated;
select tests.claims('$U');
do \$p\$ declare r jsonb; begin
  r := public.buy_shop_item('zobo', 2, '44444444-4444-4444-8444-444444444444');
  begin
    r := public.buy_shop_item('zobo', 2, '44444444-4444-4444-8444-444444444444');
  exception when others then
    raise exception 'FAIL: shop retry was not replayed (got %: %)', sqlstate, sqlerrm;
  end;
  if not (r ->> 'replayed')::boolean then raise exception 'FAIL: shop retry was not replayed (charged again)'; end if;
end \$p\$;
select tests.expect_error(\$\$select public.buy_shop_item('puff-puff', 2, '44444444-4444-4444-8444-444444444444')\$\$, 'OG422', 'request id reused for another item refused');
select tests.expect_error(\$\$select public.buy_shop_item('adire-scarf', 3, gen_random_uuid())\$\$, '22023', 'more than the per-purchase limit refused');
reset role;
update public.players set cash = 1000 where user_id = '$U';
update public.inventory_items x set quantity = 995 from public.inventories i, public.players p
 where i.id = x.inventory_id and p.id = i.player_id and p.user_id = '$U' and x.item_key = 'water-sachet';
set role authenticated;
select tests.expect_error(\$\$select public.buy_shop_item('water-sachet', 5, gen_random_uuid())\$\$, 'OG409', 'bag limit refused');
select tests.expect_error(\$\$select public.buy_shop_item('adire-scarf', 1, gen_random_uuid())\$\$, 'OG402', 'buyer without enough cash refused');
select tests.ok((select cash = 1000 from public.players), 'buyer without enough cash keeps ₦1,000');
SQL
}
# run_econ_probe <probe> <signature> <header> [OLD NEW ...]: like run_probe above, for a 3.4A function.
run_econ_probe() {
  local probe=$1 sig=$2 header=$3 out; shift 3
  out=$( { echo "begin;"; [ $# -gt 0 ] && echo "$(fn_mutate "$sig" "$header" "$@");"; "$probe"; echo "rollback;"; } | psql -X -q -v ON_ERROR_STOP=1 2>&1 )
  if echo "$out" | grep -q 'mutation did not apply'; then echo "unapplied: $(echo "$out" | grep -m1 'mutation did not apply' | sed 's/^.*ERROR: *//')"
  elif echo "$out" | grep -qE 'ERROR|FAIL'; then echo "fail: $(echo "$out" | grep -m1 -E 'ERROR|FAIL' | sed 's/^.*ERROR: *//')"
  else echo pass; fi
}
check_econ_mutation() { # <label> <expected failure text> <probe> <signature> <header> OLD NEW [...]
  local label=$1 expected=$2 r; shift 2
  r=$(run_econ_probe "$@")
  case "$r" in
    unapplied:*) echo "FAIL: mutation '$label' did not apply (${r#unapplied: }): update the mutation, it no longer matches $2" >&2; exit 1 ;;
    pass) echo "FAIL: removing $label was NOT caught" >&2; exit 1 ;;
  esac
  case "${r#fail: }" in
    *"$expected"*) echo "PASS: removing $label is caught: ${r#fail: }" | cut -c1-220 ;;
    *) echo "FAIL: removing $label failed for an unexpected reason: '${r#fail: }' (expected '$expected')" >&2; exit 1 ;;
  esac
}
for probe in probe_start:START probe_claim:CLAIM probe_shop:SHOP; do
  sig_var="${probe#*:}_SIG"; hdr_var="${probe#*:}_HDR"
  r=$(run_econ_probe "${probe%%:*}" "${!sig_var}" "${!hdr_var}")
  [ "$r" = "pass" ] || { echo "FAIL: ${probe%%:*} does not pass on the reviewed functions: $r" >&2; exit 1; }
done
echo "PASS: the start, claim and shop probes pass on the reviewed functions"
check_econ_mutation "the already-working check" "FAIL: second shift while working refused — expected OG409, got 23505" probe_start "$START_SIG" "$START_HDR" \
  "if exists (select 1 from public.job_shifts where player_id = v_player.id and status = 'working') then" 'if false then'
echo "  (with the check removed, the one-working-shift unique index still refuses the second shift)"
check_econ_mutation "the daily shift limit" "FAIL: shift over the daily limit refused — expected error OG429, but it succeeded" probe_start "$START_SIG" "$START_HDR" \
  'if v_today >= 20 then' 'if false then'
check_econ_mutation "the shift-finished check" "FAIL: claim before the shift ends refused — expected error OG425, but it succeeded" probe_claim "$CLAIM_SIG" "$CLAIM_HDR" \
  'if now() < v_shift.ends_at then' 'if false then'
check_econ_mutation "the claim idempotency lookup" "FAIL: claim retry was not replayed (got OG404" probe_claim "$CLAIM_SIG" "$CLAIM_HDR" \
  'where player_id = v_player.id and idempotency_key = p_idempotency_key;' 'where false;'
check_econ_mutation "the working-shift filter" "FAIL: second claim of a paid shift refused — expected OG404, got 23505" probe_claim "$CLAIM_SIG" "$CLAIM_HDR" \
  "where player_id = v_player.id and status = 'working' for update;" 'where player_id = v_player.id order by started_at desc limit 1 for update;'
echo "  (with the filter removed, the one-payout-per-shift unique index still refuses paying a shift twice)"
check_econ_mutation "the shop idempotency lookup" "FAIL: shop retry was not replayed (got 23505" probe_shop "$SHOP_SIG" "$SHOP_HDR" \
  'where player_id = v_player.id and idempotency_key = p_idempotency_key;' 'where false;'
check_econ_mutation "the request-id reuse check" "FAIL: request id reused for another item refused — expected error OG422, but it succeeded" probe_shop "$SHOP_SIG" "$SHOP_HDR" \
  "if v_req.kind <> 'shop_purchase' or v_prev.item_key <> p_item_key or v_prev.quantity <> p_quantity then" "if v_req.kind <> 'shop_purchase' then"
check_econ_mutation "the per-purchase limit" "FAIL: more than the per-purchase limit refused — expected error 22023, but it succeeded" probe_shop "$SHOP_SIG" "$SHOP_HDR" \
  'if p_quantity > v_item.max_per_purchase then' 'if false then'
check_econ_mutation "the bag limit" "FAIL: bag limit refused — expected" probe_shop "$SHOP_SIG" "$SHOP_HDR" \
  'if coalesce(v_have, 0) + p_quantity > 999 then' 'if false then'
check_econ_mutation "the shop balance checks" "FAIL: buyer without enough cash refused — expected OG402, got 23514" probe_shop "$SHOP_SIG" "$SHOP_HDR" \
  'if v_player.cash < v_total then' 'if false then' \
  'where id = v_player.id and cash >= v_total' 'where id = v_player.id'
echo "  (with the balance checks removed, players.cash CHECK (cash >= 0) still refuses the purchase)"
( check_econ_mutation "an unmatched pattern (self-test)" "anything" probe_shop "$SHOP_SIG" "$SHOP_HDR" 'this text is not in buy_shop_item' 'x' ) >/dev/null 2>&1 \
  && { echo "FAIL: harness self-test: an unmatched 3.4A mutation pattern did not fail the run" >&2; exit 1; }
[ "$(econ_md5)" = "$econ_orig" ] || { echo "FAIL: a mutation leaked into the reviewed 3.4A functions" >&2; exit 1; }
# Row locks need two connections: commit a mutant of claim_job_shift, race it, then restore the reviewed version.
ORIG_CLAIM=$(mktemp)
psql -X -At -c "select pg_get_functiondef('$CLAIM_SIG'::regprocedure)" >"$ORIG_CLAIM"
trap 'rm -f "$ORIG_CLAIM"; cleanup' EXIT
claim_mutant() { psql -X -q -v ON_ERROR_STOP=1 -c "$(fn_mutate "$CLAIM_SIG" "$CLAIM_HDR" "$@")" >/dev/null 2>&1 || { echo "FAIL: claim lock mutation did not apply ($1)" >&2; exit 1; }; }
claim_restore() { psql -X -q -v ON_ERROR_STOP=1 -f "$ORIG_CLAIM"; [ "$(econ_md5)" = "$econ_orig" ] || { echo "FAIL: could not restore claim_job_shift" >&2; exit 1; }; }
# Player lock removed: an overlapping retry is no longer answered from the first claim (it waits on the
# shift lock instead and then finds no shift to claim).
s=$(rpc "$(euser 23)" "select public.start_job_shift('buka-helper')"); [ "$s" = ok ] || { echo "FAIL: start for the lock mutants: $s" >&2; exit 1; }
finish_shift "$(euser 23)"; key=$(cat /proc/sys/kernel/random/uuid)
claim_mutant 'where user_id = v_uid for update;' 'where user_id = v_uid;'
r=$(overlap_rpc "$(euser 23)" "select public.claim_job_shift('$key')" "$(euser 23)" "select public.claim_job_shift('$key')"); claim_restore
[ "$r" = "OG404 waited" ] && [ "$(payouts_of "$(euser 23)")" = "1" ] || { echo "FAIL: overlap retry did not catch the missing player lock in claim_job_shift (got '$r')" >&2; exit 1; }
echo "PASS: removing claim_job_shift's player row lock is caught: an overlapping retry is no longer replayed (got OG404)"
# Both locks removed: two overlapping claims both see the shift as working; the unique index on
# economy_transactions(job_shift_id) still refuses the second payout.
s=$(rpc "$(euser 24)" "select public.start_job_shift('buka-helper')"); [ "$s" = ok ] || { echo "FAIL: start for the lock mutants: $s" >&2; exit 1; }
finish_shift "$(euser 24)"
claim_mutant 'where user_id = v_uid for update;' 'where user_id = v_uid;' "status = 'working' for update;" "status = 'working';"
r=$(overlap_rpc "$(euser 24)" "select public.claim_job_shift(gen_random_uuid())" "$(euser 24)" "select public.claim_job_shift(gen_random_uuid())"); claim_restore
[ "$r" = "23505 waited" ] && [ "$(payouts_of "$(euser 24)")" = "1" ] && [ "$(cash_of "$(euser 24)")" = "51500" ] \
  || { echo "FAIL: without both locks the payout index should still refuse a double payout (got '$r', payouts $(payouts_of "$(euser 24)"))" >&2; exit 1; }
echo "PASS: with both claim locks removed, the one-payout-per-shift index still refuses the second payout (23505); paid once"
rm -f "$ORIG_CLAIM"
[ "$(econ_md5)" = "$econ_orig" ] || { echo "FAIL: the 3.4A functions differ from the reviewed versions after the mutation checks" >&2; exit 1; }
echo "PASS: start_job_shift, claim_job_shift and buy_shop_item restored to the reviewed versions"

echo "▶ upgrade path: a Phase 3.3A database holding a land purchase (production's current state) takes Phase 3.4A"
docker rm -f "$NAME" >/dev/null
start_db
apply_migrations 20261023
OLD_LAND_VERIFY="$ROOT/supabase/verify/phase3_3a_land_check.sql"
# The request-simulation helpers (tests.claims etc.) from the Phase 1 test file, without its tests.
helpers=$(sed -n '/^-- ---------- test helpers/,/^grant execute on function tests.ok/p' "$ROOT/supabase/tests/phase1_players.test.sql")
grep -q 'function tests.claims' <<<"$helpers" || { echo "FAIL: could not find the test helpers in phase1_players.test.sql" >&2; exit 1; }
psql -X -q -v ON_ERROR_STOP=1 -c "$helpers" >/dev/null
psql -X -q -v ON_ERROR_STOP=1 -c "insert into auth.users (id, email) values ('00000000-0000-4000-d000-000000000001', 'up1@test.local'), ('00000000-0000-4000-d000-000000000002', 'up2@test.local')"
for u in 00000000-0000-4000-d000-000000000001 00000000-0000-4000-d000-000000000002; do
  s=$(as_user "$u" "select public.create_character('Upgrade Player', '$AVATAR');"); [ -z "$s" ] || { echo "FAIL: upgrade-path character: $s" >&2; exit 1; }
done
UP_KEY=$(cat /proc/sys/kernel/random/uuid)
r=$(buy 00000000-0000-4000-d000-000000000001 kuto-03 "$UP_KEY"); [ "$r" = ok ] || { echo "FAIL: upgrade-path land purchase: $r" >&2; exit 1; }
out=$(land_rows -c "begin transaction read only" -f "$OLD_LAND_VERIFY" -c "rollback")
echo "$out" | grep -q '^00 ALL CHECKS|t|' && echo "$out" | grep -q '^i1 fresh install.*|t|no:' || { echo "$out"; echo "FAIL: 3.3A land check does not pass on the 3.3A database with a purchase" >&2; exit 1; }
echo "PASS: before the upgrade, the Phase 3.3A land check passes (fresh install = no, one purchase)"
r=$(precheck 00000000-0000-4000-d000-000000000001)
case "$r" in "t|t|1|1|1|1|0|f|BLOCKED: this player owns 1 plot(s) of land."*) ;; *) echo "FAIL: pre-check on a 3.3A database (no job_shifts table): $r" >&2; exit 1 ;; esac
echo "PASS: the account deletion pre-check also runs on a 3.3A database, which has no job_shifts table"
# Everything that exists before the upgrade, as one fingerprint (it holds ids, but only in this throwaway database).
snapshot() { psql -X -At -c "select md5((select string_agg(user_id || ':' || cash, ',' order by user_id) from public.players) || '|' || (select coalesce(string_agg(plot_key || ':' || coalesce(owner_player_id::text, '-') || ':' || coalesce(acquired_at::text, '-'), ',' order by plot_key), '') from public.land_plots) || '|' || (select string_agg(id || ':' || kind || ':' || player_id || ':' || plot_id || ':' || amount, ',' order by id) from public.economy_transactions) || '|' || (select string_agg(id || ':' || transaction_id || ':' || account || ':' || coalesce(player_id::text, '-') || ':' || amount || ':' || coalesce(balance_after::text, '-'), ',' order by id) from public.ledger_entries) || '|' || (select string_agg(player_id || ':' || idempotency_key || ':' || kind || ':' || plot_id || ':' || transaction_id, ',' order by idempotency_key) from public.economic_requests) || '|' || (select string_agg(inventory_id || ':' || item_key || ':' || quantity, ',' order by inventory_id, item_key) from public.inventory_items))" | grep -E '^[0-9a-f]{32}$'; }
snap=$(snapshot)
[ -n "$snap" ] || { echo "FAIL: could not take the upgrade-path snapshot" >&2; exit 1; }
psql -X -q -v ON_ERROR_STOP=1 -c "begin" -f "$ECON_MIGRATION" -c "commit" >/dev/null
[ "$(snapshot)" = "$snap" ] || { echo "FAIL: applying Phase 3.4A changed existing players, land, ledger, requests or inventories" >&2; exit 1; }
out=$(land_rows -c "begin transaction read only" -f "$LAND_VERIFY" -c "rollback")
echo "$out" | grep -q '^00 ALL CHECKS|t|' && echo "$out" | grep -q '^i1 fresh install.*|t|no: owned plots=1 transactions=1 ledger lines=2 paid shifts=0 shop purchases=0$' \
  || { echo "$out"; echo "FAIL: economy check does not pass right after upgrading a 3.3A database with a purchase" >&2; exit 1; }
echo "PASS: Phase 3.4A applies on top of it, every existing row is unchanged, and the economy check passes (1 plot, 1 transaction, 2 ledger lines)"
[ "$(land_ok -c "begin transaction read only" -f "$OLD_LAND_VERIFY" -c "rollback")" = "f" ] || { echo "FAIL: the 3.3A land check should report the 3.4A schema as different" >&2; exit 1; }
echo "PASS: the superseded 3.3A land check now reports differences (use phase3_4a_economy_check.sql after the upgrade)"
r=$(buy 00000000-0000-4000-d000-000000000001 kuto-03 "$UP_KEY")
[ "$r" = replay ] && [ "$(snapshot)" = "$snap" ] || { echo "FAIL: retrying the pre-upgrade land purchase after the upgrade gave '$r' or changed data" >&2; exit 1; }
echo "PASS: retrying the pre-upgrade purchase after the upgrade is replayed, nothing charged"
# The 3.4A rollback with only land history present: allowed, and it restores the exact 3.3A schema.
psql -X -q -v ON_ERROR_STOP=1 -c "begin" -f "$ECON_DOWN" -c "commit" >/dev/null
out=$(land_rows -c "begin transaction read only" -f "$OLD_LAND_VERIFY" -c "rollback")
echo "$out" | grep -q '^00 ALL CHECKS|t|' && [ "$(snapshot)" = "$snap" ] || { echo "$out"; echo "FAIL: after the 3.4A rollback the 3.3A land check does not pass, or data changed" >&2; exit 1; }
echo "PASS: the 3.4A rollback (no job/shop history yet) restores the exact 3.3A schema: the 3.3A land check passes, data unchanged"
# Moved here from the land rollback section: the explicit-refund path of the 3.3A rollback.
lbefore=$(land_state)
if psql -X -q -v ON_ERROR_STOP=1 -c "begin" -f "$LAND_DOWN" -c "commit" >/dev/null 2>&1; then echo "FAIL: land rollback ran without ogs.rollback_refund while a purchase exists" >&2; exit 1; fi
[ "$(land_state)" = "$lbefore" ] || { echo "FAIL: refused land rollback changed something" >&2; exit 1; }
lafter=$(psql -X -At -v ON_ERROR_STOP=1 -c "begin" -c "set ogs.rollback_refund = 'yes'" -f "$LAND_DOWN" -c "select (select count(*) from pg_class where relnamespace = 'public'::regnamespace and relname in ('land_plots', 'economy_transactions', 'ledger_entries', 'economic_requests')) || '/' || (select count(*) from pg_proc where pronamespace = 'public'::regnamespace and proname in ('buy_land_plot', 'get_land_plots', 'get_my_land', 'ledger_check_balanced', 'economy_append_only')) || '/' || (select count(*) from pg_policies) || '/' || (select count(*) from pg_proc where pronamespace = 'public'::regnamespace and proname in ('create_character', 'get_player_profiles', 'mp_my_player_id')) || '/' || (select count(*) || ':' || sum(cash) from public.players) || '/' || (select count(*) from public.inventory_items)" -c "rollback" 2>/dev/null | grep -E '^[0-9]+/')
lexpected="0/0/$(echo "$lbefore" | cut -d/ -f3)/$(echo "$lbefore" | cut -d/ -f4)/2:100000/$(echo "$lbefore" | cut -d/ -f6)"
[ "$lafter" = "$lexpected" ] && [ "$(land_state)" = "$lbefore" ] || { echo "FAIL: refund rollback left $lafter, expected $lexpected (or leaked)" >&2; exit 1; }
echo "PASS: the 3.3A rollback refuses while a purchase exists; with ogs.rollback_refund = 'yes' it refunds to pre-ledger cash and removes only the land objects ($lafter)"
# Re-applying 3.4A after its rollback works, and the result passes the economy check again.
psql -X -q -v ON_ERROR_STOP=1 -c "begin" -f "$ECON_MIGRATION" -c "commit" >/dev/null
[ "$(land_ok -c "begin transaction read only" -f "$LAND_VERIFY" -c "rollback")" = "t" ] && [ "$(snapshot)" = "$snap" ] \
  || { echo "FAIL: re-applying 3.4A after its rollback does not give a passing economy check with data intact" >&2; exit 1; }
echo "PASS: Phase 3.4A re-applies cleanly after its rollback; economy check passes, data unchanged"

echo "✔ all database tests passed"
