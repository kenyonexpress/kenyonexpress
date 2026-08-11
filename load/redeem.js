import { check } from 'k6'
import http from 'k6/http'
import { Counter } from 'k6/metrics'
import { BASE, assertWritesAllowed, required } from './lib/guard.js'
import { MUST_BE_ZERO, PAGE_LATENCY } from './lib/thresholds.js'

/**
 * L4 -- the redemption queue. docs/ARCHITECTURE-TESTING.md 5.2: an event at one
 * supplier, 50 scans a minute against a single RPC that takes a row lock.
 *
 * The correctness question is the whole point, and unlike L3's it is decidable
 * from inside k6. Every VU races the same pool of codes. `redeem_voucher` (051)
 * is atomic, so each code may succeed exactly once and every later attempt must
 * come back `already_redeemed`. Total successes therefore has one correct
 * value: the number of codes. One more is a double redemption -- the row lock
 * failing under exactly the contention this scenario exists to create.
 *
 * Codes and the supplier session are supplied, not minted: issuing vouchers
 * needs a paid order, and a load script that creates its own money is a load
 * script that has stopped measuring redemption.
 */

assertWritesAllowed('L4 redeem')

const COOKIE = required('LOAD_SUPPLIER_COOKIE')
const CODES = required('LOAD_VOUCHER_CODES')
  .split(',')
  .map((c) => c.trim())
  .filter(Boolean)

if (CODES.length < 2) {
  throw new Error('LOAD_VOUCHER_CODES needs at least 2 codes for the race to mean anything')
}

const SCANS_PER_MINUTE = Number(__ENV.LOAD_SCAN_RPM ?? 50)

const succeeded = new Counter('redeem_success')
const alreadyRedeemed = new Counter('redeem_already')
const serverErrors = new Counter('redeem_server_errors')

export const options = {
  scenarios: {
    event_queue: {
      executor: 'constant-arrival-rate',
      rate: SCANS_PER_MINUTE,
      timeUnit: '1m',
      duration: __ENV.LOAD_DURATION ?? '1m',
      preAllocatedVUs: 20,
      maxVUs: 50,
    },
  },
  thresholds: {
    'http_req_duration{name:redeem}': PAGE_LATENCY.redeem,
    redeem_server_errors: MUST_BE_ZERO,
    // The gate. Anything above the code count is a double redemption.
    redeem_success: [
      `count<=${CODES.length}`,
      { threshold: `count<=${CODES.length}`, abortOnFail: true },
    ],
    checks: ['rate>0.99'],
  },
}

export default function () {
  const code = CODES[Math.floor(Math.random() * CODES.length)]

  const res = http.post(
    `${BASE}/api/supplier/vouchers/redeem`,
    JSON.stringify({ code, method: 'manual' }),
    {
      headers: { 'Content-Type': 'application/json', Cookie: COOKIE },
      tags: { name: 'redeem' },
    },
  )

  // See webhooks.js: the zero keeps the gate a gate on a quiet run.
  serverErrors.add(0)
  succeeded.add(0)
  if (res.status >= 500) serverErrors.add(1)

  let outcome = null
  try {
    outcome = res.json('outcome')
  } catch {
    outcome = null
  }

  if (outcome === 'success') succeeded.add(1)
  if (outcome === 'already_redeemed') alreadyRedeemed.add(1)

  check(res, {
    'redeem not 5xx': (r) => r.status < 500,
    // Under a race every answer is one of these two. `unauthorized` means the
    // supplied session expired, and would otherwise pass as a quiet no-op.
    'redeem settled': () => outcome === 'success' || outcome === 'already_redeemed',
  })
}
