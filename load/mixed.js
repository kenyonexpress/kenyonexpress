import { check, group, sleep } from 'k6'
import http from 'k6/http'
import { Counter, Rate } from 'k6/metrics'
import { catalogue, sample } from './lib/catalogue.js'
import { BASE, assertNotProduction } from './lib/guard.js'
import { ERROR_RATE, PAGE_LATENCY, latency } from './lib/thresholds.js'

/**
 * L7 -- realistic mixed traffic, held for half an hour.
 *
 * WHY THIS EXISTS WHEN FIVE SCENARIOS ALREADY DO. Every other file here drives
 * ONE path: browse hits pages, search hits the search API, pool hits `/api/cart`.
 * Each answers "how fast is this route under its own load", and none answers the
 * question capacity planning is actually about -- what happens when the cheap
 * requests and the expensive ones are in the same queue. A homepage that serves
 * in 44ms alone can serve in 900ms while four search queries are holding
 * connections, and no single-path run can show that, because in a single-path
 * run there is nothing else in the queue.
 *
 * THE MIX IS A SHAPE, NOT A GUESS DRESSED AS DATA. This site has four paid
 * orders, so there is no traffic log to derive weights from and pretending
 * otherwise would put a fabricated number in a results table. What is used
 * instead is the funnel every shop has, stated as an assumption and easy to
 * change: most sessions browse, a minority search, a few open the cart, and one
 * in a hundred reaches checkout. LOAD_MIX overrides it.
 *
 * READ-ONLY BY CONSTRUCTION, WITH NO FLAG TO CHANGE THAT. The checkout leg
 * loads the checkout PAGE and stops there. It never posts, so there is no
 * `LOAD_ALLOW_WRITES` here and `assertNotProduction` is the only gate it needs
 * -- a scenario carrying a flag it does not honour is worse than one that never
 * offered it.
 *
 * The page is the interesting half for capacity anyway: it is the heaviest
 * server render on the site and it reads the cart on every request with no
 * cache. `checkout.js` is the write scenario, it needs staging and a sandbox
 * terminal, and duplicating it inside a thirty-minute soak would leave hundreds
 * of abandoned orders behind -- which changes the data the run was measuring.
 *
 * HALF AN HOUR, NOT FIVE MINUTES. The failures a soak finds are the ones a
 * spike cannot: a connection pool that leaks one connection per thousand
 * requests, a cache that fills, an ISR revalidation that stampedes on the hour.
 * Five minutes at peak measures the peak; thirty measures whether the peak is
 * survivable.
 */

assertNotProduction()

const PEAK = Number(__ENV.LOAD_VUS ?? 200)
const RAMP = __ENV.LOAD_RAMP ?? '3m'
const HOLD = __ENV.LOAD_HOLD ?? '30m'

/**
 * Cumulative weights over 100. `browse` is everything below the first number,
 * `search` between the first and second, and so on. Stated cumulatively because
 * that is how it is read at the call site and a set of shares that does not add
 * to 100 is then impossible rather than merely wrong.
 */
const MIX = (__ENV.LOAD_MIX ?? '70,88,97,100').split(',').map(Number)
const [BROWSE_MAX, SEARCH_MAX, CART_MAX, TOTAL] = MIX

if (TOTAL !== 100 || BROWSE_MAX >= SEARCH_MAX || SEARCH_MAX >= CART_MAX || CART_MAX >= TOTAL) {
  throw new Error(`LOAD_MIX must be four ascending cumulative percentages ending at 100: ${MIX}`)
}

/** A 429 is the limiter working, not the app failing. Never summed with 5xx. */
const rateLimited = new Rate('rate_limited')
/** How many sessions took each branch, so the mix in the report is measured. */
const sessions = new Counter('sessions_by_leg')

export const options = {
  scenarios: {
    mixed_day: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: RAMP, target: PEAK },
        { duration: HOLD, target: PEAK },
        { duration: RAMP, target: 0 },
      ],
      gracefulRampDown: '30s',
    },
  },
  thresholds: {
    // Each leg keeps its own budget from 5.3. One blended p95 would hide the
    // thing this scenario exists to find: the checkout page degrading while the
    // homepage, which is 70% of the requests, holds the average down.
    'http_req_duration{name:home}': PAGE_LATENCY.home,
    'http_req_duration{name:product}': PAGE_LATENCY.product,
    'http_req_duration{name:category}': PAGE_LATENCY.home,
    'http_req_duration{name:search}': latency(800, 1500),
    'http_req_duration{name:cart}': latency(800, 1500),
    'http_req_duration{name:checkout_page}': PAGE_LATENCY.begin_checkout,
    http_req_failed: ERROR_RATE,
    checks: ['rate>0.99'],
  },
}

/**
 * Search terms off real slugs, the same derivation `search.js` uses and for the
 * same reason: a made-up term returns empty fast and flatters every number in
 * the table. Decoded before splitting, because the sitemap percent-encodes
 * Hebrew slugs and slicing an encoded string cuts an escape sequence in half.
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
  console.log(
    `mixed: ${found.products.length} products, ${found.categories.length} categories, ` +
      `${terms.length} search terms, mix ${MIX.join('/')}, read-only`,
  )
  return { ...found, terms }
}

function get(path, name) {
  const res = http.get(`${BASE}${path}`, { tags: { name } })
  rateLimited.add(res.status === 429)
  return res
}

/** The 70%: someone who came to look. */
function browseSession(data) {
  group('browse', () => {
    const home = get('/', 'home')
    check(home, {
      'home 200': (r) => r.status === 200,
      'home rendered': (r) => r.body.includes('</html>'),
    })
    sleep(1 + Math.random() * 3)

    const product = get(sample(data.products), 'product')
    check(product, {
      'product 200': (r) => r.status === 200,
      'product has price': (r) => r.body.includes('₪'),
    })
    sleep(1 + Math.random() * 4)

    if (Math.random() < 0.6) {
      check(get(sample(data.categories), 'category'), { 'category 200': (r) => r.status === 200 })
      sleep(1 + Math.random() * 3)
    }
  })
}

/** The 18%: someone who came with a word in mind. */
function searchSession(data) {
  group('search', () => {
    const term = encodeURIComponent(sample(data.terms))
    // The PAGE and not `/api/search`: a shopper searching renders a full server
    // component tree, and that is the request that competes with the browse
    // traffic for the same pool. The API route has its own scenario.
    check(get(`/search?q=${term}`, 'search'), { 'search 200': (r) => r.status === 200 })
    sleep(2 + Math.random() * 4)
    check(get(sample(data.products), 'product'), { 'product 200': (r) => r.status === 200 })
    sleep(1 + Math.random() * 3)
  })
}

/** The 9%: someone who put something down and walked off. */
function cartSession(data) {
  group('cart', () => {
    check(get(sample(data.products), 'product'), { 'product 200': (r) => r.status === 200 })
    sleep(1 + Math.random() * 2)
    // Per-shopper and explicitly no-store, so this is a real connection every
    // time -- the same property that makes `pool.js` use it.
    check(get('/api/cart', 'cart'), { 'cart answered': (r) => r.status === 200 })
    sleep(2 + Math.random() * 4)
  })
}

/**
 * The 3%: someone who reached the checkout screen.
 *
 * A GET only. It renders the form and reads the cart, which is the expensive
 * part and the part that contends with everything else; the POST belongs to
 * `checkout.js`, behind its own write flag.
 */
function checkoutSession(data) {
  group('checkout', () => {
    check(get(sample(data.products), 'product'), { 'product 200': (r) => r.status === 200 })
    sleep(1 + Math.random() * 2)
    const page = get('/checkout', 'checkout_page')
    check(page, {
      // 200 renders the form; a redirect to the cart is the correct answer for
      // a VU whose cart is empty, and both prove the route answered.
      'checkout answered': (r) => r.status === 200 || r.status === 302 || r.status === 307,
    })
    sleep(2 + Math.random() * 3)
  })
}

export default function (data) {
  const roll = Math.random() * 100
  if (roll < BROWSE_MAX) {
    sessions.add(1, { leg: 'browse' })
    browseSession(data)
  } else if (roll < SEARCH_MAX) {
    sessions.add(1, { leg: 'search' })
    searchSession(data)
  } else if (roll < CART_MAX) {
    sessions.add(1, { leg: 'cart' })
    cartSession(data)
  } else {
    sessions.add(1, { leg: 'checkout' })
    checkoutSession(data)
  }
}
