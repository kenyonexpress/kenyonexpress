#!/usr/bin/env bash
# Runs the database authorization suites against the live policies.
#
# WHY A SCRIPT AND NOT `pnpm test`. Those suites gate on SUPABASE_URL and
# SUPABASE_ANON_KEY and skip without them, which is right - a security test that
# cannot reach the database must skip rather than pass falsely. The consequence
# is that they had never run: 25 skipped, every run, locally and in CI, and
# nobody had looked at what the 25 were.
#
# BOTH VALUES ARE PUBLIC. The anon key is compiled into the client bundle of
# every page. This reads them from .env.local under their NEXT_PUBLIC_ names so
# there is nothing to paste and nothing to leak.
#
# READ-ONLY. These suites sign in as nobody and assert that anon CANNOT reach
# what it must not. They create nothing, which is what separates them from
# `pnpm seed:test` - the reason secrets.CI_SUPABASE_* stays unset.
#
# MEASURED 2026-09-08, the first time they were ever executed: 27 passed,
# 11 skipped. The 11 need seeded fixture users and say so by name.
set -euo pipefail
cd "$(dirname "$0")/.."

if [ ! -f .env.local ]; then
  echo "run-rls-tests: .env.local not found; nothing to read the public URL and anon key from." >&2
  exit 2
fi

SUPABASE_URL="$(grep -E '^NEXT_PUBLIC_SUPABASE_URL=' .env.local | cut -d= -f2-)"
SUPABASE_ANON_KEY="$(grep -E '^NEXT_PUBLIC_SUPABASE_ANON_KEY=' .env.local | cut -d= -f2-)"

if [ -z "${SUPABASE_URL}" ] || [ -z "${SUPABASE_ANON_KEY}" ]; then
  echo "run-rls-tests: .env.local has no NEXT_PUBLIC_SUPABASE_URL / _ANON_KEY." >&2
  echo "Refusing to run: without them every assertion would skip and report green." >&2
  exit 2
fi

export SUPABASE_URL SUPABASE_ANON_KEY
exec npx vitest run src/db/__tests__ "$@"
