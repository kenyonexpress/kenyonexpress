#!/bin/bash
# XF04: one full Playwright run against a fresh production build on its own port.
#
# Usage: bash logs/xf04/run.sh <run-number>
#
# Starts `pnpm start` on 3454 with the same env the Playwright webServer block
# would pass (mock Cardcom, the webhook secret, the app URL that matches the
# base URL, checkout on), refuses to measure unless the listener on that port
# belongs to THIS checkout and serves THIS build, runs the whole suite (all
# three projects) with the list and json reporters, and stops the server it
# started. Raw artefacts go to /tmp/xf04 (the json reporter output is large
# and biome checks logs/); the summary is written by summarize.mjs.
set -u
N="${1:?run number}"
ROOT=/Users/ofir/kenyonexpress-autopilot
PORT=3454
OUT=/tmp/xf04
mkdir -p "$OUT"
cd "$ROOT" || exit 1

if /usr/sbin/lsof -nP -iTCP:$PORT -sTCP:LISTEN >/dev/null 2>&1; then
  echo "run$N: port $PORT is already held, refusing" | tee -a "$OUT/summary.txt"
  exit 2
fi

CARDCOM_USE_MOCK=true \
CARDCOM_WEBHOOK_SECRET=mock-webhook-secret \
NEXT_PUBLIC_APP_URL=http://localhost:$PORT \
CHECKOUT_ENABLED=true \
E2E_MOCK_CHECKOUT=local-build \
PORT=$PORT \
pnpm start >"$OUT/server-run$N.log" 2>&1 &
PNPM_PID=$!

for _ in $(seq 1 90); do
  code=$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:$PORT/" || true)
  [ "$code" = "200" ] && break
  sleep 2
done

LISTENER=$(/usr/sbin/lsof -nP -iTCP:$PORT -sTCP:LISTEN | awk 'NR==2{print $2}')
CWD=$(/usr/sbin/lsof -p "$LISTENER" 2>/dev/null | awk '$4=="cwd"{print $NF}')
BUILD_ID=$(cat .next/BUILD_ID)
SERVED=$(curl -s "http://localhost:$PORT/" | grep -c "$BUILD_ID")
echo "run$N: listener pid=$LISTENER cwd=$CWD build=$BUILD_ID served_build_refs=$SERVED" | tee -a "$OUT/summary.txt"
if [ "$CWD" != "$ROOT" ] || [ "$SERVED" = "0" ]; then
  echo "run$N: wrong server, refusing" | tee -a "$OUT/summary.txt"
  kill "$LISTENER" "$PNPM_PID" 2>/dev/null
  exit 3
fi

START=$(date +%s)
E2E_BASE_URL="http://localhost:$PORT" \
E2E_ADMIN_EMAIL=e2e-admin@kenyonexpress.co.il \
E2E_FORWARDED_FOR_PREFIX="10.44.$N" \
PLAYWRIGHT_JSON_OUTPUT_NAME="$OUT/run$N.json" \
pnpm exec playwright test --reporter=list,json >"$OUT/run$N.log" 2>&1
EXIT=$?
END=$(date +%s)
echo "run$N: exit=$EXIT seconds=$((END - START)) started=$(date -r "$START" '+%H:%M:%S') ended=$(date -r "$END" '+%H:%M:%S')" | tee -a "$OUT/summary.txt"
tail -3 "$OUT/run$N.log" | tee -a "$OUT/summary.txt"

kill "$LISTENER" 2>/dev/null
kill "$PNPM_PID" 2>/dev/null
wait "$PNPM_PID" 2>/dev/null
exit $EXIT
