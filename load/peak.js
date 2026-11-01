import { check, sleep } from 'k6'
import exec from 'k6/execution'
import http from 'k6/http'
import { Rate } from 'k6/metrics'
import { catalogue, sample } from './lib/catalogue.js'
import { BASE, assertNotProduction } from './lib/guard.js'
import { PAGE_LATENCY } from './lib/thresholds.js'

/**
 * Peak concurrency, stepped: how many simultaneous shoppers one deployment of
 * the storefront holds before the p95 leaves its budget, and what breaks
 * first when it does.
 *
 * `browse.js` is the flash-sale GATE: one ramp to a target, thresholds that
 * abort the run the moment they are crossed, exit 99 on failure. This file
 * is the REPORT: the same read-only journey (home, product, listing), but
 * the load climbs through fixed plateaus and every request is tagged with
 * the plateau it was made on, so the summary is a curve -- p95 and error
 * rate per concurrency step -- instead of a single pass/fail. Nothing aborts:
 * the plateau that fails IS the finding, and stopping there would lose the
 * ones after it that show how the failure grows.
 *
 * The default profile is 100 -> 250 -> 500 -> 1000 VUs. A VU here is a
 * shopper with think time (0-3s between pages, 0-5s before the next
 * journey), so 1000 VUs is roughly 1000 concurrent users and about 450
 * requests per second, not 1000 rps. Read-only by construction, and the
 * production host is refused at init like every other scenario.
 *
 * LOAD_STEPS   comma-separated plateaus, default 100,250,500,1000
 * LOAD_RAMP    ramp between plateaus, default 30s
 * LOAD_HOLD    time on each plateau, default 60s
 * LOAD_SUMMARY path for the JSON summary (handleSummary); default none
 *
 * Note for anyone reading a local run: the previous rounds in
 * docs/LOAD-TEST-RESULTS.md found one `next start` process on a laptop
 * saturating around 60-70 VUs, with the load generator sharing the CPU. That
 * number is the laptop's, not the deployment's. The curve is still useful:
 * it shows WHICH page falls over first and whether the failure is latency
 * (queueing) or errors (a dead process), and it cannot be measured on Vercel
 * without a preview deployment and a database that is not production.
 */

assertNotProduction()

const STEPS = String(__ENV.LOAD_STEPS ?? '100,250,500,1000')
  .split(',')
  .map((s) => Number(s.trim()))
  .filter((n) => Number.isFinite(n) && n > 0)
const RAMP = __ENV.LOAD_RAMP ?? '30s'
const HOLD = __ENV.LOAD_HOLD ?? '60s'

if (STEPS.length === 0) throw new Error('LOAD_STEPS must name at least one plateau')

const stages = []
for (const target of STEPS) {
  stages.push({ duration: RAMP, target })
  stages.push({ duration: HOLD, target })
}
stages.push({ duration: RAMP, target: 0 })

const rateLimited = new Rate('rate_limited')
const errorRate = new Rate('page_errors')

/**
 * One threshold per page per plateau, so k6 prints the p95 for each cell of
 * the curve in its own summary. The budget is the section 5.3 target and it
 * is NOT abortOnFail here (see the header): a red cell is a data point.
 */
const thresholds = {
  checks: ['rate>0.99'],
}
for (const step of STEPS) {
  thresholds[`http_req_duration{name:home,step:${step}}`] = [
    `p(95)<${PAGE_LATENCY.home[0].slice(6)}`,
  ]
  thresholds[`http_req_duration{name:product,step:${step}}`] = [
    `p(95)<${PAGE_LATENCY.product[0].slice(6)}`,
  ]
  thresholds[`http_req_duration{name:listing,step:${step}}`] = [
    `p(95)<${PAGE_LATENCY.home[0].slice(6)}`,
  ]
  thresholds[`page_errors{step:${step}}`] = ['rate<0.01']
}

export const options = {
  scenarios: {
    peak: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages,
      gracefulRampDown: '10s',
    },
  },
  thresholds,
}

/** The plateau this request belongs to: the smallest configured step that is
 *  at or above the current active VU count. Ramps are attributed to the
 *  plateau they climb towards. */
function currentStep() {
  const active = exec.instance.vusActive
  for (const step of STEPS) if (active <= step) return String(step)
  return String(STEPS[STEPS.length - 1])
}

export function setup() {
  const found = catalogue(BASE)
  console.log(
    `catalogue: ${found.products.length} products, ${found.categories.length} categories; steps ${STEPS.join(' -> ')} VUs, ramp ${RAMP}, hold ${HOLD}`,
  )
  return found
}

function get(path, name) {
  const step = currentStep()
  const res = http.get(`${BASE}${path}`, { tags: { name, step }, timeout: '30s' })
  rateLimited.add(res.status === 429, { step })
  // 429 is the limiter working and is excluded from the error rate on purpose;
  // 0 is a connection failure (the process died), which is the worst error.
  errorRate.add(res.status === 0 || res.status >= 500, { step })
  return res
}

export default function (data) {
  const home = get('/', 'home')
  check(home, {
    'home 200': (r) => r.status === 200,
    'home rendered': (r) => r.status === 200 && r.body.includes('</html>'),
  })
  sleep(Math.random() * 3)

  const product = get(sample(data.products), 'product')
  check(product, {
    'product 200': (r) => r.status === 200,
    'product has price': (r) => r.status === 200 && r.body.includes('₪'),
  })
  sleep(Math.random() * 3)

  const listing =
    Math.random() < 0.5 ? get('/products', 'listing') : get(sample(data.categories), 'listing')
  check(listing, { 'listing 200': (r) => r.status === 200 })
  sleep(Math.random() * 5)
}

/**
 * The curve as JSON, one row per (page, step): p50/p95/max latency, request
 * count and the error and rate-limit rates. Written where LOAD_SUMMARY points
 * and printed to stdout as the normal k6 summary either way.
 */
export function handleSummary(data) {
  const rows = []
  const m = data.metrics
  for (const step of STEPS) {
    for (const name of ['home', 'product', 'listing']) {
      const key = `http_req_duration{name:${name},step:${step}}`
      const d = m[key]
      if (!d) continue
      const err = m[`page_errors{step:${step}}`]
      const rl = m[`rate_limited{step:${step}}`]
      rows.push({
        step,
        page: name,
        requests: d.values.count ?? null,
        p50_ms: round(d.values.med),
        p95_ms: round(d.values['p(95)']),
        max_ms: round(d.values.max),
        error_rate: err ? round(err.values.rate, 4) : null,
        rate_limited: rl ? round(rl.values.rate, 4) : null,
        threshold_ok: d.thresholds ? Object.values(d.thresholds).every((t) => t.ok) : null,
      })
    }
  }
  const summary = {
    base: BASE,
    steps: STEPS,
    ramp: RAMP,
    hold: HOLD,
    total_requests: m.http_reqs ? m.http_reqs.values.count : null,
    failed_rate: m.http_req_failed ? round(m.http_req_failed.values.rate, 4) : null,
    max_vus: m.vus_max ? m.vus_max.values.max : null,
    rows,
  }
  const out = { stdout: textSummary(summary) }
  if (__ENV.LOAD_SUMMARY) out[__ENV.LOAD_SUMMARY] = JSON.stringify(summary, null, 2)
  return out
}

function round(v, digits = 0) {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null
  const f = 10 ** digits
  return Math.round(v * f) / f
}

function textSummary(s) {
  const lines = [
    '',
    `peak curve against ${s.base}: steps ${s.steps.join(' -> ')} VUs, ramp ${s.ramp}, hold ${s.hold}`,
    `requests ${s.total_requests}, failed ${s.failed_rate}, max VUs ${s.max_vus}`,
    '',
    ' step     page      reqs    p50    p95    max  errors  429s  ok',
  ]
  for (const r of s.rows) {
    lines.push(
      `${String(r.step).padStart(5)}  ${r.page.padEnd(8)} ${String(r.requests).padStart(6)} ${String(r.p50_ms).padStart(6)} ${String(r.p95_ms).padStart(6)} ${String(r.max_ms).padStart(6)}  ${String(r.error_rate).padStart(6)} ${String(r.rate_limited).padStart(5)}  ${r.threshold_ok === null ? '-' : r.threshold_ok ? 'yes' : 'NO'}`,
    )
  }
  lines.push('')
  return lines.join('\n')
}
