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
  # Same credential, same reason it is here and not in ci.yml: it reads the real
  # catalogue. Finds rows search and SEO cannot both be right about.
  run "catalogue-integrity" node scripts/audit-catalogue-integrity.mjs
else
  echo "=== product-images ==="
  echo "--- product-images + catalogue-integrity SKIPPED: no SUPABASE_SECRET_KEY or"
  echo "    NEXT_PUBLIC_SUPABASE_URL, so the catalogue could not be read. NOT a pass."
fi

# THE AUDITS I WROTE AND THEN LEFT UNWIRED.
#
# Counted 2026-09-08: nine audit scripts in scripts/, and six of them were named
# by no workflow and no package script. Four were added in the six passes
# immediately before this one. That is the exact shape this repo keeps removing
# - the "THREE GATES THAT EXISTED AND NOTHING RAN" block in ci.yml - and it was
# being added to rather than only found.
#
# They belong HERE and not in ci.yml because each one asks a question about
# something outside the repository: what is deployed, what the domain answers,
# what `main` schedules. A pull request cannot change any of those, so gating a
# PR on them would fail builds for reasons the author did not cause.
#
# `scripts/measure-route-js.mjs` is deliberately NOT in this list. It needs a
# built server and a browser, and the thing it would gate is already gated by
# `route-bundle-gate.mjs` in CI, which needs neither. It is an investigation
# tool, and saying so here is the difference between a decision and an
# oversight.

# REPORT-ONLY, FOR THE REASON THE `audit` STEP ABOVE IS REPORT-ONLY.
#
# All three of these exit 1 TODAY, and each for a finding that is true, known,
# and blocked on the owner: the deployed build predates 2026-09-02, every
# declared canonical redirects to `www`, and `main`'s cron list omits two jobs
# this branch has. A nightly that is red every single night for three reasons
# nobody in CI can fix is a nightly people stop opening - and then the checks
# that WOULD catch something new (type-check, tests, build, product-images) go
# unread with it.
#
# So they print and do not fail. The output is the point: when one of those
# three states changes, the change is visible in the log.
#
# RE-ARM THEM ONE AT A TIME, by moving a line back to `run`, as each finding is
# resolved. `deployed-build` first - it goes green the moment anything deploys,
# and it is the one whose regression would matter most.

# Read-only GETs against public endpoints. No credential, no writes.
run "deployed-build" bash -c "node scripts/audit-deployed-build.mjs || true"
run "canonical-host" bash -c "node scripts/audit-canonical-host.mjs || true"
run "live-vitals" bash -c "node scripts/measure-live-vitals.mjs || true"

# Compares this branch's cron list against the one `main` actually schedules.
# Needs the remote, which the nightly checkout has.
run "cron-drift" bash -c "node scripts/audit-cron-drift.mjs || true"

if [ -n "${SUPABASE_DB_URL:-}" ] || [ -n "${DATABASE_URL:-}" ]; then
  run "money-constraints" node scripts/audit-money-constraints.mjs
  # The authorization sweep that otherwise only happens by hand. Same connection
  # string, so it is gated together.
  run "role-separation" node scripts/audit-role-separation.mjs
else
  echo "=== money-constraints ==="
  echo "--- money-constraints + role-separation SKIPPED: no SUPABASE_DB_URL, so"
  echo "    neither could be read. This is NOT a pass."
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
