#!/usr/bin/env bash
# API integration tests for the REAL Next.js land routes, against a DISPOSABLE local stack.
#
#   npm run test:api
#
# Starts, on 127.0.0.1 only:
#   - the official Supabase Postgres image (migrations applied as `postgres`, as Supabase does),
#   - Supabase Auth (GoTrue) and PostgREST, with a JWT secret generated for this run only,
#   - a tiny gateway (scripts/api-test/gateway.mjs) that serves /auth/v1 and /rest/v1 like Supabase,
#   - a production build of the app (`next build` + `next start`) in a temporary copy of the repo,
# then runs scripts/api-test/*.test.mjs over HTTP and removes everything.
#
# It never reads DATABASE_URL, .env files or any Supabase credentials, so it cannot touch a real
# project. Test users sign up with e-mail auto-confirmation (local GoTrue only).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PG_IMAGE="${SUPABASE_PG_IMAGE:-supabase/postgres:15.8.1.085}"
AUTH_IMAGE="${SUPABASE_AUTH_IMAGE:-supabase/gotrue:v2.177.0}"
REST_IMAGE="${POSTGREST_IMAGE:-postgrest/postgrest:v12.2.12}"
PG_PORT="${TEST_API_PG_PORT:-54379}"; AUTH_PORT="${TEST_API_AUTH_PORT:-59979}"; REST_PORT="${TEST_API_REST_PORT:-53079}"
GW_PORT="${TEST_API_GATEWAY_PORT:-54381}"; APP_PORT="${TEST_API_APP_PORT:-3101}"; SMTP_PORT="${TEST_API_SMTP_PORT:-2526}"
RUN="osl-api-$$"; NET="$RUN-net"; DB="$RUN-db"; AUTH="$RUN-auth"; REST="$RUN-rest"
PASS="local-test-only"
TEST_JWT_SECRET="$(node -e "process.stdout.write(require('crypto').randomBytes(32).toString('hex'))")"
export TEST_JWT_SECRET
WORK="$(mktemp -d)"
PIDS=()

command -v docker >/dev/null || { echo "docker is required" >&2; exit 2; }
command -v psql >/dev/null || { echo "psql (PostgreSQL client) is required" >&2; exit 2; }

cleanup() {
  # Each background server runs in its own process group: kill the whole group (npx/next children too).
  for p in "${PIDS[@]:-}"; do [ -n "$p" ] && { kill -- "-$p" 2>/dev/null || kill "$p" 2>/dev/null || true; }; done
  docker rm -f "$DB" "$AUTH" "$REST" >/dev/null 2>&1 || true
  docker network rm "$NET" >/dev/null 2>&1 || true
  rm -rf "$WORK"
}
trap cleanup EXIT

wait_for() { # $1 = description, $2.. = command that succeeds when ready
  local what=$1; shift
  for _ in $(seq 1 120); do "$@" >/dev/null 2>&1 && return 0; sleep 1; done
  echo "FAIL: $what did not become ready" >&2; exit 1
}

# A leftover server on one of these ports would answer instead of the fresh build: refuse to start.
for port in "$PG_PORT" "$AUTH_PORT" "$REST_PORT" "$GW_PORT" "$APP_PORT" "$SMTP_PORT"; do
  if (exec 3<>"/dev/tcp/127.0.0.1/$port") 2>/dev/null; then echo "FAIL: port $port is already in use; stop whatever is listening there first" >&2; exit 2; fi
done

echo "▶ starting Postgres ($PG_IMAGE), Auth and PostgREST on 127.0.0.1"
docker network create "$NET" >/dev/null
docker run -d --name "$DB" --network "$NET" -p "127.0.0.1:$PG_PORT:5432" -e POSTGRES_PASSWORD="$PASS" "$PG_IMAGE" >/dev/null
export PGHOST=127.0.0.1 PGPORT="$PG_PORT" PGUSER=postgres PGPASSWORD="$PASS" PGDATABASE=postgres
wait_for "Postgres" bash -c "docker logs $DB 2>&1 | grep -q 'PostgreSQL init process complete' && psql -Atqc 'select 1'"
# Local-only passwords for the service roles, so GoTrue and PostgREST can log in.
psql -q -U supabase_admin -c "alter role supabase_auth_admin with password '$PASS'; alter role authenticator with password '$PASS';"
# Auth e-mails (password reset) go to a test-only SMTP sink on the host; tests read them from $MAIL_DIR.
MAIL_DIR="$WORK/mail"
setsid node "$ROOT/scripts/api-test/smtp-sink.mjs" "$SMTP_PORT" "$MAIL_DIR" >"$WORK/smtp.log" 2>&1 &
PIDS+=($!)
docker run -d --name "$AUTH" --network "$NET" -p "127.0.0.1:$AUTH_PORT:9999" --add-host=host.docker.internal:host-gateway \
  -e GOTRUE_SMTP_HOST=host.docker.internal -e GOTRUE_SMTP_PORT="$SMTP_PORT" -e GOTRUE_SMTP_ADMIN_EMAIL=noreply@ogs.test \
  -e GOTRUE_SMTP_SENDER_NAME="OGS test" -e GOTRUE_SMTP_MAX_FREQUENCY=1s \
  -e GOTRUE_API_HOST=0.0.0.0 -e PORT=9999 -e API_EXTERNAL_URL="http://127.0.0.1:$GW_PORT/auth/v1" \
  -e GOTRUE_DB_DRIVER=postgres -e GOTRUE_DB_DATABASE_URL="postgres://supabase_auth_admin:$PASS@$DB:5432/postgres" \
  -e GOTRUE_SITE_URL="http://127.0.0.1:$APP_PORT" -e GOTRUE_URI_ALLOW_LIST="http://127.0.0.1:$APP_PORT/**" \
  -e GOTRUE_MAILER_URLPATHS_RECOVERY=/auth/v1/verify \
  -e GOTRUE_JWT_SECRET="$TEST_JWT_SECRET" -e GOTRUE_JWT_EXP=3600 -e GOTRUE_JWT_AUD=authenticated \
  -e GOTRUE_JWT_DEFAULT_GROUP_NAME=authenticated -e GOTRUE_JWT_ADMIN_ROLES=service_role \
  -e GOTRUE_EXTERNAL_EMAIL_ENABLED=true -e GOTRUE_MAILER_AUTOCONFIRM=true -e GOTRUE_DISABLE_SIGNUP=false \
  -e GOTRUE_RATE_LIMIT_EMAIL_SENT=1000 \
  "$AUTH_IMAGE" >/dev/null
wait_for "Auth" curl -sf --noproxy '*' "http://127.0.0.1:$AUTH_PORT/health"

echo "▶ applying test-only setup and migrations"
for f in "$ROOT"/supabase/tests/setup/*.sql; do psql -q -v ON_ERROR_STOP=1 -U supabase_admin -f "$f" >/dev/null; done
for f in "$ROOT"/supabase/migrations/*.sql; do echo "  - $(basename "$f")"; psql -q -v ON_ERROR_STOP=1 -f "$f" >/dev/null; done

docker run -d --name "$REST" --network "$NET" -p "127.0.0.1:$REST_PORT:3000" \
  -e PGRST_DB_URI="postgres://authenticator:$PASS@$DB:5432/postgres" -e PGRST_DB_SCHEMAS=public \
  -e PGRST_DB_ANON_ROLE=anon -e PGRST_JWT_SECRET="$TEST_JWT_SECRET" "$REST_IMAGE" >/dev/null
wait_for "PostgREST" curl -sf --noproxy '*' "http://127.0.0.1:$REST_PORT/"

setsid node "$ROOT/scripts/api-test/gateway.mjs" "$GW_PORT" "$AUTH_PORT" "$REST_PORT" >"$WORK/gateway.log" 2>&1 &
PIDS+=($!)
wait_for "gateway" curl -sf --noproxy '*' "http://127.0.0.1:$GW_PORT/auth/v1/health"

ANON_KEY="$(node "$ROOT/scripts/api-test/jwt.mjs" anon)"
SERVICE_KEY="$(node "$ROOT/scripts/api-test/jwt.mjs" service_role)"

echo "▶ building the app against the local stack (temporary copy; the repo's .next is not touched)"
mkdir -p "$WORK/app"
tar -C "$ROOT" --exclude=./node_modules --exclude=./.next --exclude=./.git --exclude='./.env*' -cf - . | tar -C "$WORK/app" -xf -
ln -s "$ROOT/node_modules" "$WORK/app/node_modules"
(
  cd "$WORK/app"
  NEXT_PUBLIC_SUPABASE_URL="http://127.0.0.1:$GW_PORT" NEXT_PUBLIC_SUPABASE_ANON_KEY="$ANON_KEY" NEXT_TELEMETRY_DISABLED=1 \
    node node_modules/next/dist/bin/next build >"$WORK/build.log" 2>&1
) || { tail -30 "$WORK/build.log"; echo "FAIL: next build" >&2; exit 1; }
( cd "$WORK/app" && NEXT_PUBLIC_SUPABASE_URL="http://127.0.0.1:$GW_PORT" NEXT_PUBLIC_SUPABASE_ANON_KEY="$ANON_KEY" NEXT_TELEMETRY_DISABLED=1 \
    exec setsid node node_modules/next/dist/bin/next start -H 127.0.0.1 -p "$APP_PORT" ) >"$WORK/app.log" 2>&1 &
PIDS+=($!)
wait_for "the app" curl -sf --noproxy '*' "http://127.0.0.1:$APP_PORT/api/health"
# Make sure the server answering is the one built from THIS tree (its build id is served under /_next).
BUILD_ID="$(cat "$WORK/app/.next/BUILD_ID")"
curl -sf --noproxy '*' "http://127.0.0.1:$APP_PORT/" | grep -q "$BUILD_ID" || { echo "FAIL: the server on port $APP_PORT is not this build" >&2; exit 1; }

echo "▶ running API tests (scripts/api-test/*.test.mjs)"
APP_URL="http://127.0.0.1:$APP_PORT" SUPABASE_URL="http://127.0.0.1:$GW_PORT" ANON_KEY="$ANON_KEY" SERVICE_KEY="$SERVICE_KEY" \
  REST_CONTAINER="$REST" REST_HEALTH="http://127.0.0.1:$REST_PORT/" MAIL_DIR="$MAIL_DIR" NO_PROXY='*' no_proxy='*' \
  node --test --test-concurrency=1 "$ROOT"/scripts/api-test/*.test.mjs || { echo "--- app log (tail)"; tail -30 "$WORK/app.log"; exit 1; }
echo "✔ all API tests passed"
