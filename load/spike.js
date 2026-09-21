import { check, sleep } from 'k6'
import http from 'k6/http'
import { Rate } from 'k6/metrics'
import { catalogue, sample } from './lib/catalogue.js'
import { BASE, assertNotProduction } from './lib/guard.js'
import { TREND_STATS } from './lib/summary.js'
import { ERROR_RATE, PAGE_LATENCY, latency } from './lib/thresholds.js'

/**
 * L8 -- spike: ten times the baseline, instantly, for sixty seconds.
 *
 * browse.js is a ramp: it answers "how far does the site scale". This is a
 * step: it answers "what happens in the second the load arrives" -- the deal
 * that lands in a WhatsApp group of five hundred people, where nobody ramps.
 * A ramp warms every cache and opens every pool connection on the way up; a
 * step hits cold caches and a pool at its resting size, which is where a
 * connection-acquire timeout or a stampede on a revalidating page lives.
 *
 * Three phases, each tagged so the summary keeps them apart, because a single
 * p95 across all three is an average of a quiet site and a besieged one and
 * describes neither:
 *
 *  - `baseline`, LOAD_BASELINE VUs (default 5) for LOAD_WARM_S seconds: what
 *    normal looks like on this target, so the spike has something to be
 *    compared with.
 *  - `spike`, LOAD_SPIKE_FACTOR times that (default 10x = 50 VUs) for
 *    LOAD_SPIKE_S seconds (default 60): the step itself. The gate here is the
 *    product page's *failure* point from section 5.3, not its target -- a
 *    spike is allowed to degrade, it is not allowed to break.
 *  - `recovery`, back to the baseline for LOAD_RECOVERY_S seconds, gated at the
 *    product page's normal target. This is the assertion that matters most: a
 *    site that is slow during the spike and still slow a minute after it has
 *    a leak, not a capacity limit.
 *
 * Product pages only. Section 42 says "500 concurrent browsing product pages,
 * spike 10x"; the product page is the heaviest read a shopper makes and the
 * one rendered from the database on every uncached hit. Read-only by
 * construction, so it runs anywhere except production (guard.js).
 *
 * The phase is decided by wall clock since setup() finished, not by
 * `exec.instance.currentTestRunDuration`, because that clock starts before
 * setup and setup fetches five sitemap files; a request made in the first
 * second of the spike would otherwise be filed under `baseline`.
 */

assertNotProduction()

const BASELINE = Number(__ENV.LOAD_BASELINE ?? 5)
const FACTOR = Number(__ENV.LOAD_SPIKE_FACTOR ?? 10)
const WARM_S = Number(__ENV.LOAD_WARM_S ?? 30)
const SPIKE_S = Number(__ENV.LOAD_SPIKE_S ?? 60)
const RECOVERY_S = Number(__ENV.LOAD_RECOVERY_S ?? 30)

for (const [name, value] of Object.entries({ BASELINE, FACTOR, WARM_S, SPIKE_S, RECOVERY_S })) {
  if (!Number.isFinite(value) || value <= 0)
    throw new Error(`${name} must be a positive number, got ${value}`)
}

const PEAK = BASELINE * FACTOR

/** 429s are the limiter working, not the app failing; kept out of http_req_failed. */
const rateLimited = new Rate('rate_limited')

export const options = {
  summaryTrendStats: TREND_STATS,
  scenarios: {
    spike: {
      executor: 'ramping-vus',
      startVUs: BASELINE,
      stages: [
        { duration: `${WARM_S}s`, target: BASELINE },
        // A zero-length stage is the step: k6 jumps to the target at once.
        { duration: '0s', target: PEAK },
        { duration: `${SPIKE_S}s`, target: PEAK },
        { duration: '0s', target: BASELINE },
        { duration: `${RECOVERY_S}s`, target: BASELINE },
      ],
      gracefulRampDown: '5s',
    },
  },
  thresholds: {
    'http_req_duration{phase:baseline}': PAGE_LATENCY.product,
    // Degrade, do not break: the 5.3 failure point becomes the target, and
    // twice that aborts.
    'http_req_duration{phase:spike}': latency(1500, 3000),
    'http_req_duration{phase:recovery}': PAGE_LATENCY.product,
    http_req_failed: ERROR_RATE,
    checks: ['rate>0.99'],
  },
}

export function setup() {
  const found = catalogue(BASE)
  console.log(
    `catalogue: ${found.products.length} products; spike ${BASELINE} -> ${PEAK} VUs for ${SPIKE_S}s`,
  )
  return { products: found.products, startedAt: Date.now() }
}

function phaseAt(elapsedSeconds) {
  if (elapsedSeconds < WARM_S) return 'baseline'
  if (elapsedSeconds < WARM_S + SPIKE_S) return 'spike'
  return 'recovery'
}

export default function (data) {
  const phase = phaseAt((Date.now() - data.startedAt) / 1000)
  const res = http.get(`${BASE}${sample(data.products)}`, { tags: { name: 'product', phase } })
  rateLimited.add(res.status === 429)
  check(res, {
    'product 200': (r) => r.status === 200,
    'product has price': (r) => r.body.includes('₪'),
  })
  // A shopper reads the page. Without a pause 50 VUs is 50 tight loops, which
  // is a benchmark of the load generator, not a spike of shoppers.
  sleep(0.5 + Math.random())
}
