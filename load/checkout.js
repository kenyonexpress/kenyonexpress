import { check, sleep } from 'k6'
import http from 'k6/http'
import { Counter } from 'k6/metrics'
import { BASE, assertWritesAllowed, required } from './lib/guard.js'
import { ERROR_RATE, MUST_BE_ZERO, PAGE_LATENCY } from './lib/thresholds.js'

/**
 * L2 -- concurrent checkout. docs/ARCHITECTURE-TESTING.md 5.2, 50 VU steady,
 * measuring `begin_checkout` and idempotency.
 *
 * WHAT THIS SCRIPT CAN AND CANNOT DRIVE, because the difference matters more
 * than the numbers.
 *
 * `beginCheckout` is a server action, not a route handler. A server action is
 * reached by POSTing to the page URL with a `Next-Action` header carrying an id
 * that is a per-build hash -- there is no stable URL for k6 to hold. It is also
 * rate-limited to 10 per minute per user (checkout.ts:242), which is the
 * correct behaviour and also means "50 concurrent checkouts" is 50 distinct
 * seeded accounts, not one account hit 50 times.
 *
 * So the script takes both as inputs rather than pretending:
 *   LOAD_CHECKOUT_SESSIONS  newline-separated Cookie headers, one per account
 *   LOAD_CHECKOUT_ACTION_ID the action id for the build under test
 * With the action id absent, the run still exercises the checkout path under
 * concurrency (cart bootstrap + checkout page render) and says clearly in the
 * output that the money-writing half was skipped. It does not report a green
 * `begin_checkout` p95 it never measured.
 */

assertWritesAllowed('L2 checkout')

const SESSIONS = required('LOAD_CHECKOUT_SESSIONS')
  .split('\n')
  .map((s) => s.trim())
  .filter(Boolean)

const ACTION_ID = __ENV.LOAD_CHECKOUT_ACTION_ID ?? ''
const VUS = Number(__ENV.LOAD_VUS ?? 50)

const begun = new Counter('checkout_begun')
const rateLimited = new Counter('checkout_rate_limited')
const serverErrors = new Counter('checkout_server_errors')

if (SESSIONS.length < VUS) {
  console.warn(
    `${SESSIONS.length} sessions for ${VUS} VUs: accounts will be shared, and the 10/min per-user limiter will dominate the result. Seed one account per VU.`,
  )
}

export const options = {
  scenarios: {
    steady: {
      executor: 'constant-vus',
      vus: VUS,
      duration: __ENV.LOAD_DURATION ?? '2m',
    },
  },
  thresholds: {
    'http_req_duration{name:checkout_page}': PAGE_LATENCY.home,
    'http_req_duration{name:begin_checkout}': PAGE_LATENCY.begin_checkout,
    http_req_failed: ERROR_RATE,
    checkout_server_errors: MUST_BE_ZERO,
    checks: ['rate>0.99'],
  },
}

export function setup() {
  if (!ACTION_ID) {
    console.warn(
      'LOAD_CHECKOUT_ACTION_ID not set: measuring the checkout path only, NOT ' +
        'begin_checkout. See load/README.md for how to read the id off the build.',
    )
  }
  return { withAction: Boolean(ACTION_ID) }
}

/** One account per VU where possible; wraps only when under-seeded. */
function session() {
  return SESSIONS[(__VU - 1) % SESSIONS.length]
}

export default function (data) {
  const cookie = session()

  const cart = http.get(`${BASE}/api/cart`, {
    headers: { Cookie: cookie },
    tags: { name: 'cart_bootstrap' },
  })
  check(cart, { 'cart 200': (r) => r.status === 200 })

  const page = http.get(`${BASE}/checkout`, {
    headers: { Cookie: cookie },
    tags: { name: 'checkout_page' },
  })
  // See webhooks.js: keeps the zero-gate evaluated on a clean run.
  serverErrors.add(0)
  if (page.status >= 500) serverErrors.add(1)
  check(page, { 'checkout page 200': (r) => r.status === 200 })

  if (data.withAction) {
    const res = http.post(`${BASE}/checkout`, JSON.stringify([{}]), {
      headers: {
        Cookie: cookie,
        'Content-Type': 'application/json',
        'Next-Action': ACTION_ID,
      },
      tags: { name: 'begin_checkout' },
    })
    if (res.status >= 500) serverErrors.add(1)
    if (res.status === 429 || String(res.body).includes('rate_limited')) rateLimited.add(1)
    else if (res.status === 200) begun.add(1)

    check(res, { 'begin_checkout not 5xx': (r) => r.status < 500 })
  }

  sleep(1 + Math.random() * 2)
}

/**
 * Idempotency, like L3's double charge, is a property of the rows. README.md
 * carries the query: one order per (user, idempotency key), and zero orders in
 * a paid state without a matching payment event.
 */
