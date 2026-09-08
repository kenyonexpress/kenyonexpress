#!/usr/bin/env bash
# The nightly health loop (G13): every quality gate this laptop can actually
# run, one report, loud failures.
#
#   bash scripts/nightly-health.sh            # run everything runnable
#   NIGHTLY_NTFY=1 bash scripts/nightly-health.sh   # also ping ntfy on failure
#
# WHAT IS DELIBERATELY NOT HERE, so nobody believes it ran:
#   * Playwright E2E  -- needs a built server on a free port and ~10 minutes;
#                        run `pnpm test:e2e` against `pnpm start` (see
#                        e2e-must-run-against-pnpm-start in the project memory).
#   * Lighthouse      -- localhost numbers are Lantern simulations and have
#                        misled this repo before (lighthouse-lcp memory).
#   * compare.mjs     -- needs the live site and a fresh local server; it is a
#                        measurement session, not a health check.
set -uo pipefail
cd "$(dirname "$0")/.."

FAILED=()
run() {
  local name="$1"; shift
  echo "=== $name ==="
  if "$@"; then echo "--- $name OK"; else echo "--- $name FAILED"; FAILED+=("$name"); fi
}

run "type-check" pnpm type-check
run "lint" pnpm biome check src scripts
run "vitest" pnpm test
run "build" pnpm build
run "audit" bash -c "pnpm audit --prod --audit-level high || true"  # report-only:
# the fix for a transitive advisory is a dependency PR, not a red nightly that
# trains everyone to ignore red nightlies. High/critical findings appear in the
# log above and in Dependabot.

# THE PRODUCT-IMAGE AUDIT: WRITTEN, AND UNTIL NOW RUN BY NOTHING.
#
# scripts/audit-product-images.mjs was added after thirty-six product image URLs
# in production were found still pointing at kenyonexpress.co.il/wp-content/,
# which answers 403 since the DNS was cut to Vercel. Every one was a broken
# image on a live product page and nothing noticed, because a dead absolute URL
# is indistinguishable from a live one to type-check, lint and vitest.
#
# It was then referenced by no workflow and no package script. This repo has
# shipped that exact shape before - see the "THREE GATES THAT EXISTED AND
# NOTHING RAN" block in .github/workflows/ci.yml.
#
# It belongs HERE and not in ci.yml because it reads the real catalogue, and no
# workflow in this repository carries production Supabase credentials: the
# CI_SUPABASE_* secrets name a disposable database that `pnpm seed:test` writes
# to, so auditing it would audit fixtures. So the nightly runs it when a key is
# present in the environment and says out loud when there is none, rather than
# printing nothing and leaving a green run to mean "clean".
if [ -n "${SUPABASE_SECRET_KEY:-}" ] && [ -n "${NEXT_PUBLIC_SUPABASE_URL:-}" ]; then
  run "product-images" node scripts/audit-product-images.mjs
else
  echo "=== product-images ==="
  echo "--- product-images SKIPPED: no SUPABASE_SECRET_KEY/NEXT_PUBLIC_SUPABASE_URL in the"
  echo "    environment, so the catalogue could not be read. This is NOT a pass."
fi

echo
if [ ${#FAILED[@]} -eq 0 ]; then
  echo "NIGHTLY HEALTH: all green"
  exit 0
fi
echo "NIGHTLY HEALTH: FAILED -> ${FAILED[*]}"
if [ "${NIGHTLY_NTFY:-0}" = "1" ]; then
  curl -s -m 10 -d "nightly-health FAILED: ${FAILED[*]}" "https://ntfy.sh/kenyon-ofir-limit" > /dev/null || true
fi
exit 1
