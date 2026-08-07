import { check } from 'k6'
import http from 'k6/http'
import { Counter } from 'k6/metrics'
import { catalogue, sample } from './lib/catalogue.js'
import { BASE, assertWritesAllowed } from './lib/guard.js'
import { MUST_BE_ZERO } from './lib/thresholds.js'

/**
 * L5 -- connection pool. docs/ARCHITECTURE-TESTING.md 5.2: 500 VU for 60
 * seconds, and the deliverable is a number, not a pass. Section 5.1 says why
 * this is on the list at all: Supabase caps connections per plan and Vercel
 * opens one per serverless instance, so the wall is `too many connections` long
 * before any CPU is busy.
 *
 * Gated behind LOAD_ALLOW_WRITES even though every request here is a GET. The
 * flag is not about rows in this one case -- it is that 500 VUs exhausting a
 * connection pool takes the whole project down for everything else sharing it,
 * which on the hosted project would mean the live storefront.
 *
 * The route is chosen to defeat the cache on purpose. A `use cache` catalogue
 * page never reaches Postgres, so hammering it measures Next's cache and finds
 * no pool at all; `/api/cart` is per-shopper and explicitly `no-store`
 * (src/app/api/cart/route.ts), so every request is a real connection.
 */

assertWritesAllowed('L5 connection pool')

const PEAK = Number(__ENV.LOAD_VUS ?? 500)

/** The signature of the wall, kept apart from ordinary 5xx. */
const connectionErrors = new Counter('db_connection_errors')
const serverErrors = new Counter('server_errors')

export const options = {
  scenarios: {
    crush: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '20s', target: PEAK },
        { duration: __ENV.LOAD_DURATION ?? '60s', target: PEAK },
        { duration: '10s', target: 0 },
      ],
      gracefulRampDown: '5s',
    },
  },
  thresholds: {
    // 5.3: DB connection errors is a correctness row -- any value above zero
    // fails the run, whatever the latency looks like.
    db_connection_errors: MUST_BE_ZERO,
    // Deliberately no latency threshold: this scenario is meant to be run past
    // the point where latency is meaningless, to find where the pool ends.
  },
}

export function setup() {
  return catalogue(BASE)
}

export default function (data) {
  // Alternated so the run reports the cached and uncached paths separately: if
  // only the uncached one degrades, the wall is the pool and not the host.
  const uncached = __ITER % 2 === 0

  const res = uncached
    ? http.get(`${BASE}/api/cart`, { tags: { name: 'uncached' } })
    : http.get(`${BASE}${sample(data.products)}`, { tags: { name: 'cached' } })

  // See webhooks.js: keeps `db_connection_errors` a real gate on a clean run.
  connectionErrors.add(0)

  if (res.status >= 500) {
    serverErrors.add(1)
    const body = String(res.body ?? '')
    if (
      body.includes('too many connections') ||
      body.includes('remaining connection slots') ||
      body.includes('Max client connections reached')
    ) {
      connectionErrors.add(1)
    }
  }

  check(res, { 'not 5xx': (r) => r.status < 500 })
}
