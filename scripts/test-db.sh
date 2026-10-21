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

echo "▶ test-only setup (supabase/tests/setup: stand-ins for services the local image lacks)"
for f in "$ROOT"/supabase/tests/setup/*.sql; do
  echo "  - $(basename "$f")"
  psql -q -v ON_ERROR_STOP=1 -U supabase_admin -f "$f" >/dev/null
done

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

echo "▶ land verification script (supabase/verify/phase3_3a_land_check.sql), fresh database"
LAND_VERIFY="$ROOT/supabase/verify/phase3_3a_land_check.sql"
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
BAD
echo "PASS: land check fails on $n known-bad variants (RLS, policies, grants, sequence, definer, search_path, triggers, columns, constraints, prices, footprints, plot count, overloads, function bodies, Phase 1 policies/grants/triggers, extra callable function)"
# Whitespace-only re-indentation of a function body (what the SQL Editor may do) is accepted and reported.
out=$(land_rows -c "begin" -c "do \$d\$ declare src text; begin select prosrc into src from pg_proc where oid = 'public.buy_land_plot(text,uuid)'::regprocedure; execute format('create or replace function public.buy_land_plot(p_plot_key text, p_idempotency_key uuid) returns jsonb language plpgsql security definer set search_path = %L as %L', '', replace(src, chr(10), chr(10) || '    ')); end \$d\$" -f "$LAND_VERIFY" -c "rollback")
echo "$out" | grep -q '^00 ALL CHECKS|t|' && echo "$out" | grep -q '^12 buy_land_plot body.*|t|match=same code' \
  || { echo "$out"; echo "FAIL: land check rejects a whitespace-only re-indentation of buy_land_plot" >&2; exit 1; }
echo "PASS: land check accepts a re-indented (whitespace-only) buy_land_plot body and reports it"

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
# With the explicit refund flag: every player is refunded to their pre-ledger cash, land objects go, the rest stays.
lafter=$(psql -X -At -v ON_ERROR_STOP=1 -c "begin" -c "set ogs.rollback_refund = 'yes'" -f "$LAND_DOWN" -c "select (select count(*) from pg_class where relnamespace = 'public'::regnamespace and relname in ('land_plots', 'economy_transactions', 'ledger_entries', 'economic_requests')) || '/' || (select count(*) from pg_proc where pronamespace = 'public'::regnamespace and proname in ('buy_land_plot', 'get_land_plots', 'get_my_land', 'ledger_check_balanced', 'economy_append_only')) || '/' || (select count(*) from pg_policies) || '/' || (select count(*) from pg_proc where pronamespace = 'public'::regnamespace and proname in ('create_character', 'get_player_profiles', 'mp_my_player_id')) || '/' || (select count(*) || ':' || sum(cash) from public.players) || '/' || (select count(*) from public.inventory_items)" -c "rollback" 2>/dev/null | grep -E '^[0-9]+/')
nplayers=$(psql -Atqc "select count(*) from public.players")
lexpected="0/0/$(echo "$lbefore" | cut -d/ -f3)/$(echo "$lbefore" | cut -d/ -f4)/$nplayers:$((nplayers * 50000))/$(echo "$lbefore" | cut -d/ -f6)"
[ "$lafter" = "$lexpected" ] || { echo "FAIL: refund rollback left $lafter, expected $lexpected" >&2; exit 1; }
[ "$(land_state)" = "$lbefore" ] || { echo "FAIL: land rollback test leaked: $(land_state)" >&2; exit 1; }
echo "PASS: with ogs.rollback_refund = 'yes' the rollback refunds every player to pre-ledger cash and removes only the land objects ($lafter)"

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
BAD
echo "PASS: land check fails on $n inconsistent ownership/ledger states (plot owned without a purchase, purchase without an owner, unbalanced transaction, cash changed outside the ledger)"

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
case "$r" in "t|t|1|1|1|1|f|BLOCKED: this player owns 1 plot(s) of land."*) ;; *) echo "FAIL: pre-check for a land owner: $r" >&2; exit 1 ;; esac
echo "PASS: pre-check for a land owner (read-only): deletable = false, 'BLOCKED: this player owns 1 plot(s) of land…'"
# (C and D got characters in the concurrency tests above, so fresh users are made inside rolled-back transactions.)
r=$(precheck 00000000-0000-4000-a000-0000000000f0 -c "insert into auth.users (id, email) values ('00000000-0000-4000-a000-0000000000f0', 'fola@test.local')" | tail -1)
case "$r" in "t|f|0|0|0|0|t|OK: no land and no transaction history."*) ;; *) echo "FAIL: pre-check for a user without a character: $r" >&2; exit 1 ;; esac
r=$(precheck 00000000-0000-4000-a000-00000000000e -c "insert into auth.users (id, email) values ('00000000-0000-4000-a000-00000000000e', 'eko@test.local')" \
     -c "set role authenticated" -c "select tests.claims('00000000-0000-4000-a000-00000000000e')" \
     -c "select public.create_character('Eko Bello', '{\"body\":\"masc\",\"skin\":\"brown\",\"headwear\":\"cap\",\"outfit\":\"palm\"}')" -c "reset role" | tail -1)
case "$r" in "t|t|0|0|0|0|t|OK: no land"*) ;; *) echo "FAIL: pre-check for a player without land: $r" >&2; exit 1 ;; esac
r=$(precheck 00000000-0000-4000-a000-0000000000ff)
case "$r" in "f|f|0|0|0|0|f|No such user"*) ;; *) echo "FAIL: pre-check for an unknown user: $r" >&2; exit 1 ;; esac
echo "PASS: pre-check says deletable for a player without land and for a user without a character, and 'No such user' for an unknown id"

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

conserve=$(psql -Atqc "select (select bool_and(cash >= 0) from public.players) and (select sum(amount) = 0 from public.ledger_entries) and (select sum(cash) from public.players) + (select sum(amount) from public.ledger_entries where account <> 'player') = 50000 * (select count(*) from public.players) and not exists (select 1 from (select transaction_id, sum(amount) s, count(*) c from public.ledger_entries group by transaction_id) t where s <> 0 or c <> 2) and not exists (select 1 from public.players p join lateral (select balance_after from public.ledger_entries e where e.player_id = p.id order by e.id desc limit 1) l on true where l.balance_after <> p.cash)")
[ "$conserve" = "t" ] || { echo "FAIL: money not conserved after the concurrency tests" >&2; exit 1; }
echo "PASS: after all races: no negative cash, every transaction balances, cash + game:land-sales = pre-ledger total, ledger balances match players.cash"

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

echo "✔ all database tests passed"
