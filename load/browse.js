import { check, sleep } from 'k6'
import http from 'k6/http'
import { Rate } from 'k6/metrics'
import { catalogue, sample } from './lib/catalogue.js'
import { BASE, assertNotProduction } from './lib/guard.js'
import { ERROR_RATE, PAGE_LATENCY } from './lib/thresholds.js'

/**
 * L1 -- catalogue browsing. docs/ARCHITECTURE-TESTING.md 5.2.
 *
 * The flash-sale shape: a deal posted to WhatsApp takes the site from 5 to 500
 * visitors inside a few minutes. Read-only by construction (GET on public
 * pages), which is what makes this the one scenario safe to run outside
 * staging.
 *
 * LOAD_VUS / LOAD_STAGE override the 0->200 over 9 minutes profile, because a
 * laptop measuring a laptop wants a smaller shape than a staging soak.
 */

assertNotProduction()

const PEAK = Number(__ENV.LOAD_VUS ?? 200)
const RAMP = __ENV.LOAD_RAMP ?? '2m'
const HOLD = __ENV.LOAD_HOLD ?? '5m'

/** Split out of http_req_failed: a 429 is the rate limiter doing its job, not
 *  the app falling over, and the two must not be summed into one number. */
const rateLimited = new Rate('rate_limited')

export const options = {
  scenarios: {
    flash_sale: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: RAMP, target: PEAK },
        { duration: HOLD, target: PEAK },
        { duration: RAMP, target: 0 },
      ],
      gracefulRampDown: '10s',
    },
  },
  thresholds: {
    'http_req_duration{name:home}': PAGE_LATENCY.home,
    'http_req_duration{name:product}': PAGE_LATENCY.product,
    'http_req_duration{name:products}': PAGE_LATENCY.home,
    'http_req_duration{name:category}': PAGE_LATENCY.home,
    http_req_failed: ERROR_RATE,
    checks: ['rate>0.99'],
  },
}

export function setup() {
  const found = catalogue(BASE)
  console.log(`catalogue: ${found.products.length} products, ${found.categories.length} categories`)
  return found
}

function get(path, name) {
  const res = http.get(`${BASE}${path}`, { tags: { name } })
  rateLimited.add(res.status === 429)
  return res
}

export default function (data) {
  const home = get('/', 'home')
  check(home, {
    'home 200': (r) => r.status === 200,
    // A 200 that is an error shell would otherwise pass on status alone.
    'home rendered': (r) => r.body.includes('</html>'),
  })
  sleep(Math.random() * 3)

  const product = get(sample(data.products), 'product')
  check(product, {
    'product 200': (r) => r.status === 200,
    // The price is the one element the page exists for, and it is the last
    // thing rendered from the database.
    'product has price': (r) => r.body.includes('₪'),
  })
  sleep(Math.random() * 3)

  const listing =
    Math.random() < 0.5 ? get('/products', 'products') : get(sample(data.categories), 'category')
  check(listing, { 'listing 200': (r) => r.status === 200 })
  sleep(Math.random() * 5)
}
