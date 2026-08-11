import { check, sleep } from 'k6'
import http from 'k6/http'
import { Counter } from 'k6/metrics'
import { catalogue, sample } from './lib/catalogue.js'
import { BASE, assertNotProduction } from './lib/guard.js'
import { ERROR_RATE, latency } from './lib/thresholds.js'

/**
 * L6 -- the search crawler. docs/ARCHITECTURE-TESTING.md 5.2, 60 req/min.
 *
 * `/api/search` is the cheapest way for a stranger to make the database work:
 * unauthenticated, uncached, and an ILIKE over name_he + description_he with no
 * index behind it (src/app/api/search/route.ts). [36] put a limiter in front of
 * it -- 120 requests per 300s per IP.
 *
 * That limiter is why the profile here is a constant arrival rate rather than a
 * VU ramp. A load generator is a single IP, so a ramp does not measure the
 * search path at all: it measures how fast the limiter can say 429. The rate
 * below sits inside the documented ceiling on purpose, so `rate_limited` ending
 * at zero is a real assertion -- a shopper refining a query must never be
 * limited, which is exactly what the route's own comment claims.
 *
 * To measure the limiter instead, raise LOAD_SEARCH_RPS above 0.4/s.
 */

assertNotProduction()

const RPS = Number(__ENV.LOAD_SEARCH_RPS ?? 1)
const DURATION = __ENV.LOAD_DURATION ?? '1m'

const limited = new Counter('rate_limited')

export const options = {
  scenarios: {
    crawler: {
      executor: 'constant-arrival-rate',
      rate: RPS,
      timeUnit: '1s',
      duration: DURATION,
      preAllocatedVUs: 10,
      maxVUs: 50,
    },
  },
  thresholds: {
    // No row in 5.3 for search; it is a database read on the shopper's critical
    // path, so it is held to the product-page budget.
    'http_req_duration{name:search}': latency(800, 1500),
    'http_req_duration{name:suggest}': latency(800, 1500),
    http_req_failed: ERROR_RATE,
    checks: ['rate>0.99'],
    // Below the documented ceiling, being limited is a bug in the ceiling.
    rate_limited: ['count==0'],
  },
}

/**
 * Terms taken from real slugs, so the ILIKE matches rows and the query does the
 * work it would do for a shopper. A made-up term returns empty fast and would
 * flatter the p95.
 */
function termsFrom(products) {
  const terms = []
  for (const path of products) {
    const slug = decodeURIComponent(path.replace('/product/', ''))
    for (const token of slug.split('-')) {
      if (token.length >= 3) terms.push(token)
    }
  }
  if (terms.length === 0) throw new Error('no usable search terms in the catalogue slugs')
  return terms
}

export function setup() {
  const found = catalogue(BASE)
  const terms = termsFrom(found.products)
  console.log(`search terms: ${terms.length} from ${found.products.length} slugs`)
  return { terms }
}

export default function (data) {
  const term = sample(data.terms)

  const res = http.get(`${BASE}/api/search?q=${encodeURIComponent(term)}`, {
    tags: { name: 'search' },
  })
  limited.add(res.status === 429 ? 1 : 0)
  check(res, {
    'search 200': (r) => r.status === 200,
    'search returns json': (r) => {
      if (r.status !== 200) return false
      try {
        return Array.isArray(r.json('results'))
      } catch {
        return false
      }
    },
  })

  // The dropdown fires as the shopper types, so suggest carries the heavier
  // share of real traffic. Separate limiter (300/300s), separate tag.
  const suggest = http.get(`${BASE}/api/search/suggest?q=${encodeURIComponent(term)}`, {
    tags: { name: 'suggest' },
  })
  limited.add(suggest.status === 429 ? 1 : 0)
  check(suggest, { 'suggest not 5xx': (r) => r.status < 500 })

  sleep(0.2)
}
