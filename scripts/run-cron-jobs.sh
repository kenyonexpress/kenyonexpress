#!/usr/bin/env bash
#
# Calls the scheduled jobs that are due, from GitHub Actions.
#
# WHY THIS EXISTS. Ten jobs left `vercel.json` because Hobby runs two of them
# and silently ignores the other eight (docs/CRON-EXTERNAL.md). The replacement
# written down there is cron-job.org, which is a better scheduler than this one
# and needs a human to create ten jobs by hand in a browser. Until that happens
# nothing calls them at all, and three of the ten are on the money path while a
# fourth is the only thing that ever emails a customer their voucher. This file
# is the version that needs one repository secret and no signup.
#
# WHAT IT REFUSES TO DO. With no `CRON_SECRET` it calls nothing and exits 0.
# Every route compares the bearer against `process.env.CRON_SECRET ?? ''`, so an
# unset secret would produce ten 401s every five minutes forever - a red Actions
# list that means "not configured", which is how a real failure gets scrolled
# past. Not configured is quiet here, on purpose, and says so in the log.
set -uo pipefail

MANIFEST="${MANIFEST:-scripts/cron-jobs.json}"
TOPIC="${NTFY_TOPIC:-kenyon-ofir-limit}"

if [ -z "${CRON_SECRET:-}" ]; then
  echo "::notice::CRON_SECRET is not set on this repository. No job was called."
  echo "Set it under Settings > Secrets and variables > Actions, to the same"
  echo "value as CRON_SECRET in Vercel > Project Settings > Environment Variables."
  exit 0
fi

BASE="${CRON_BASE_URL:-}"
if [ -z "$BASE" ]; then
  BASE=$(jq -r '.defaultBaseUrl' "$MANIFEST")
fi
BASE="${BASE%/}"

# A scheduled run knows its own cron expression; a manual run names a job.
# `mapfile` would read these in one line and does not exist in bash 3.2, which
# is what a laptop here runs, so this stays a read loop: the script has to be
# runnable by hand before it is trusted on a schedule nobody watches.
if [ -n "${SCHEDULE:-}" ]; then
  SELECTOR="schedule '$SCHEDULE'"
  SELECTED=$(jq -r --arg c "$SCHEDULE" '.jobs[] | select(.cron == $c) | .name' "$MANIFEST")
elif [ "${DISPATCH_JOB:-}" = "all" ]; then
  SELECTOR="manual run, all ten"
  SELECTED=$(jq -r '.jobs[].name' "$MANIFEST")
else
  SELECTOR="manual run, '${DISPATCH_JOB:-}'"
  SELECTED=$(jq -r --arg n "${DISPATCH_JOB:-}" '.jobs[] | select(.name == $n) | .name' "$MANIFEST")
fi

if [ -z "$SELECTED" ]; then
  echo "::error::No job in $MANIFEST matches $SELECTOR."
  exit 1
fi

echo "$SELECTOR -> $(echo "$SELECTED" | tr '\n' ' ')"
echo "base: $BASE"

FAILED=""
while IFS= read -r NAME; do
  [ -n "$NAME" ] || continue
  JOB_PATH=$(jq -r --arg n "$NAME" '.jobs[] | select(.name == $n) | .path' "$MANIFEST")
  # --retry covers transient network faults and 5xx only; a 401 is not retried,
  # because retrying a wrong secret nine times is still a wrong secret.
  CODE=$(curl -s -o /dev/null -w '%{http_code}' \
    --max-time 60 --retry 2 --retry-delay 5 \
    -H "Authorization: Bearer $CRON_SECRET" \
    "$BASE$JOB_PATH")
  echo "  $NAME -> $CODE"
  case "$CODE" in
    2*) ;;
    *) FAILED="$FAILED $NAME=$CODE" ;;
  esac
done <<EOF
$SELECTED
EOF

if [ -z "$FAILED" ]; then
  exit 0
fi

# The run being red is the record. ntfy is best effort on top of it: a notifier
# that fails must not turn one failure into two.
MSG="cron failed (${SELECTOR}):${FAILED}"
echo "::error::$MSG"
curl -s -m 10 -d "$MSG" "https://ntfy.sh/${TOPIC}" >/dev/null || true
exit 1
