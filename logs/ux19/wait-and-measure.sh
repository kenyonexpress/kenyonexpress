#!/bin/bash
# Waits for the login limiter's sliding hour to free (no polling: a refused
# attempt counts too), then measures once and runs the E2E spec once.
cd /Users/ofir/kenyonexpress-autopilot || exit 1
sleep 2700
date > logs/ux19/wait-done.txt
BASE=http://localhost:3359 TAG=after node logs/ux19/probe.mjs > logs/ux19/probe-after.out 2> logs/ux19/probe-after.err
echo "probe exit $?" >> logs/ux19/wait-done.txt
E2E_BASE_URL=http://localhost:3359 pnpm exec playwright test e2e/account-orders.spec.ts --project=chromium --project=mobile-chrome > logs/ux19/e2e.log 2>&1
echo "e2e exit $?" >> logs/ux19/wait-done.txt
