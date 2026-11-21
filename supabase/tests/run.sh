#!/usr/bin/env bash
# Tests supabase/schema.sql on a throwaway local Postgres (no Supabase account needed).
# Needs Postgres 16 binaries (macOS: brew install postgresql@16). Usage: supabase/tests/run.sh
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
PGBIN="${PGBIN:-$(brew --prefix postgresql@16 2>/dev/null)/bin}"
[ -x "$PGBIN/initdb" ] || PGBIN="$(dirname "$(command -v initdb)")"

DATA="$(mktemp -d)"
trap '"$PGBIN/pg_ctl" -D "$DATA/db" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$DATA"' EXIT

"$PGBIN/initdb" -D "$DATA/db" -A trust -U postgres >/dev/null
"$PGBIN/pg_ctl" -D "$DATA/db" -o "-k $DATA -c listen_addresses='' -c wal_level=logical" -l "$DATA/log" -w start >/dev/null
export PGOPTIONS="-c client_min_messages=warning"
PSQL=("$PGBIN/psql" -h "$DATA" -U postgres -d postgres -v ON_ERROR_STOP=1 -q -X)

"${PSQL[@]}" -f "$HERE/supabase_stub.sql" >/dev/null

# An account and a vitals session saved by the previous version of the app (table vital_sessions).
"${PSQL[@]}" >/dev/null <<'SQL'
insert into auth.users (id, email) values ('c0000000-0000-4000-8000-000000000005', 'legacy@example.com');
create table public.vital_sessions (
  id uuid primary key, user_id uuid references auth.users(id), status text, headline text,
  duration_s integer, analysis jsonb, created_at timestamptz);
insert into public.vital_sessions values ('e0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000005',
  'insufficient', 'Not enough data', 30, '{"demo": false}', '2026-10-01 09:00:00+00');
SQL

# Twice: the file must be safe to run again.
"${PSQL[@]}" -f "$HERE/../schema.sql" >/dev/null
"${PSQL[@]}" -f "$HERE/../schema.sql" >/dev/null
echo "schema.sql applied twice without errors"

"${PSQL[@]}" -f "$HERE/care_team.test.sql"
