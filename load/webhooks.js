import { check } from 'k6'
import http from 'k6/http'
import { Counter } from 'k6/metrics'
import { BASE, assertWritesAllowed, required } from './lib/guard.js'
import { MUST_BE_ZERO, latency } from './lib/thresholds.js'

/**
 * L3 -- webhook flood. docs/ARCHITECTURE-TESTING.md 5.2, 100 req/s for a
 * minute, and the thing being measured is dedup, not throughput.
 *
 * Cardcom does not sign its callbacks (see the route's own header comment), so
 * authenticity rests on the `?s=` secret and on server-to-server
 * re-verification. That has a consequence for this scenario: the secret is the
 * only credential needed, so L3 is the one write path k6 can drive end to end
 * -- and the only reason it is safe is the staging gate, since every request
 * here is indistinguishable from a real payment callback.
 *
 * Half the traffic is replays of an event already sent. The route logs every
 * event first and dedups on (provider, external_event_id); a replay must be a
 * 200 no-op. A replay that instead finalises the order a second time is the
 * double charge that 5.3 calls a failed run regardless of latency.
 */

assertWritesAllowed('L3 webhooks')

const SECRET = required('LOAD_CARDCOM_WEBHOOK_SECRET')
const TERMINAL = Number(__ENV.LOAD_CARDCOM_TERMINAL ?? 1000)
const RPS = Number(__ENV.LOAD_WEBHOOK_RPS ?? 100)
const DURATION = __ENV.LOAD_DURATION ?? '1m'

const accepted = new Counter('webhook_accepted')
const rejected = new Counter('webhook_rejected')
/** Any 5xx here is the money path failing to even record an event. */
const serverErrors = new Counter('webhook_server_errors')

export const options = {
  scenarios: {
    flood: {
      executor: 'constant-arrival-rate',
      rate: RPS,
      timeUnit: '1s',
      duration: DURATION,
      preAllocatedVUs: 50,
      maxVUs: 200,
    },
  },
  thresholds: {
    'http_req_duration{name:webhook}': latency(1500, 3000),
    webhook_server_errors: MUST_BE_ZERO,
    checks: ['rate>0.99'],
  },
}

/**
 * A code that is unique per (VU, iteration) unless we are deliberately
 * replaying. `__VU`/`__ITER` are the only cross-VU-unique values k6 offers
 * without shared state.
 */
function lowProfileCode(replay) {
  return replay ? 'load-replay-fixed-0001' : `load-${__VU}-${__ITER}`
}

export default function () {
  // Every other iteration replays the same event id, so dedup is under load for
  // half the run rather than tested once at the end.
  const replay = __ITER % 2 === 1
  const code = lowProfileCode(replay)

  const payload = JSON.stringify({
    terminalnumber: TERMINAL,
    lowprofilecode: code,
    Operation: 'ChargeOnly',
    ResponseCode: 0,
    InternalDealNumber: `load-${code}`,
    Amount: 100,
    ReturnValue: __ENV.LOAD_ORDER_ID ?? 'load-test-order',
  })

  const res = http.post(`${BASE}/api/payments/cardcom/webhook?s=${SECRET}`, payload, {
    headers: { 'Content-Type': 'application/json' },
    tags: { name: 'webhook' },
  })

  // Zero every iteration so the counter always exists: a `count==0` threshold
  // over a metric that never received a sample is not an assertion, it is a
  // metric k6 has never heard of.
  serverErrors.add(0)
  if (res.status >= 500) serverErrors.add(1)
  else if (res.status === 200) accepted.add(1)
  else rejected.add(1)

  check(res, {
    // A replay is a 200 no-op by design, so both halves expect the same status.
    'webhook not 5xx': (r) => r.status < 500,
  })
}

/**
 * The double-charge assertion cannot live in k6: it is a property of the rows,
 * not of the responses. README.md carries the SQL to run against staging after
 * this scenario, and 5.3 makes a non-zero result a failed run.
 */
