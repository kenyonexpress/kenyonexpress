#!/usr/bin/env node
/**
 * The synthetic uptime check SECTIONS 41 asks for: homepage, product page and
 * checkout, every five minutes, from outside.
 *
 * WHY THIS EXISTS WHEN `production-smoke.yml` ALREADY PROBES PRODUCTION.
 * Because that one runs once a day and asks `/` and `/api/health`. Both are
 * true of every build this project has ever shipped, which is exactly why they
 * stayed green through three nights of failing cron jobs (docs/MONITORING.md,
 * section 7). A daily probe of two evergreen routes measures that the host is
 * up. It does not measure that the store can be shopped.
 *
 * These three routes are the funnel. A product page that 500s and a checkout
 * that 500s are each the whole business being down while `/` answers 200.
 *
 * WHAT IT RECORDS, AND WHY THE CACHE COLUMN IS HERE. `x-vercel-cache` is the
 * one cache-hit signal this system has. `docs/MONITORING.md` section 6.1 listed
 * cache hit rate as the single metric of the seven with no source at all,
 * because nothing in the app counts hit against miss and `unstable_cache`
 * exposes no counters. It is not in the app because it is not an application
 * fact -- it happens at the edge, and the only place to read it is a response
 * header, from a client. This is that client.
 *
 * TWO ATTEMPTS, AND THE REASON. At every five minutes this runs 288 times a
 * day. A check that pages on one dropped packet is a check whose alerts get
 * muted inside a week, and a muted check is worse than no check because it
 * still reads as covered. So a target fails only when BOTH attempts fail, and
 * the latency budget is judged on the better of the two.
 *
 *   node scripts/synthetic-probe.mjs
 *   SYNTHETIC_BASE_URL=http://localhost:3311 node scripts/synthetic-probe.mjs
 *
 * Exit 0 = every target answered 200 inside its budget. Exit 1 = at least one
 * did not, and the reason is on stdout as JSON and in the summary as text.
 */

/**
 * MEASURED 2026-09-21 against https://kenyonexpress.vercel.app from Israel:
 * three consecutive warm round trips per target were 1.19-1.69s, and a cold
 * first connection was 3.55s. All three answered 200 with `x-vercel-cache:
 * HIT`.
 *
 * The budget is 5000ms and is deliberately loose. This is an UPTIME check: a
 * budget tight enough to be a performance gate would flap on runner network
 * weather and teach its owner to ignore it, and performance already has two
 * owners that measure it properly under controlled load (`load.yml` with k6,
 * and Lighthouse CI). What 5000ms catches is the shape this is for -- a route
 * that has started taking three times as long as it ever has.
 */
const BUDGET_MS = Number(process.env.SYNTHETIC_BUDGET_MS ?? 5000)

/** Total time a single attempt may take before it counts as a failure. */
const TIMEOUT_MS = 20_000

/**
 * The default host is the `.vercel.app` alias and not the custom domain, for a
 * measured reason: `kenyonexpress.co.il` has not resolved since the Cloudflare
 * zone went missing (re-checked 2026-09-21, `dig` returns nothing at all), and
 * the custom domain answers a challenge page to a busy client even when DNS is
 * healthy. A probe aimed at a name that does not resolve reports DNS, every
 * five minutes, forever.
 */
const BASE = (process.env.SYNTHETIC_BASE_URL ?? 'https://kenyonexpress.vercel.app').replace(
  /\/$/,
  '',
)

/**
 * `barbecue-2` is a real active slug, read off the live `/products` listing on
 * 2026-09-21 rather than chosen. It is ASCII on purpose: most slugs in this
 * catalogue are Hebrew, and a percent-encoded path passing through a workflow
 * variable and a shell is a second thing that can be broken. Override with
 * SYNTHETIC_PRODUCT_PATH when the catalogue moves.
 */
const PRODUCT_PATH = process.env.SYNTHETIC_PRODUCT_PATH ?? '/product/barbecue-2'

const TARGETS = [
  { name: 'home', path: '/' },
  { name: 'product', path: PRODUCT_PATH },
  { name: 'checkout', path: '/checkout' },
]

/** Deployment Protection, if it is ever switched on. Absent is the normal case. */
const BYPASS = process.env.PRODUCTION_SMOKE_HEADER

async function attempt(path) {
  const startedAt = Date.now()
  try {
    const response = await fetch(`${BASE}${path}`, {
      redirect: 'manual',
      headers: {
        // Named so a human reading the access log knows what this traffic is
        // and does not chase it as a bot.
        'User-Agent': 'kenyonexpress-synthetic-probe/1 (+scripts/synthetic-probe.mjs)',
        ...(BYPASS ? { 'x-vercel-protection-bypass': BYPASS } : {}),
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    // Read the body. A streamed page can answer 200 with its headers and then
    // fail while rendering, and a probe that stops at the status line would
    // call that healthy.
    await response.text()
    return {
      status: response.status,
      duration_ms: Date.now() - startedAt,
      cache_status: response.headers.get('x-vercel-cache') ?? 'NONE',
      error: null,
    }
  } catch (error) {
    return {
      status: 0,
      duration_ms: Date.now() - startedAt,
      cache_status: 'NONE',
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

/**
 * Best of two. `first` is kept because "passed on the retry" is a different
 * fact from "passed", and it is the one that precedes an outage.
 */
async function probe(target) {
  const first = await attempt(target.path)
  if (first.status === 200 && first.duration_ms <= BUDGET_MS) {
    return { ...target, ...first, attempts: 1, retried: false }
  }
  const second = await attempt(target.path)
  const best = second.status === 200 && second.duration_ms < first.duration_ms ? second : first
  const chosen = second.status === 200 ? second : best
  return { ...target, ...chosen, attempts: 2, retried: true }
}

/** Fire-and-forget to Axiom, so `routes.json` has the series it charts. */
async function shipToAxiom(events) {
  const token = process.env.AXIOM_TOKEN
  const dataset = process.env.AXIOM_DATASET
  if (!token || !dataset) return 'not configured'

  try {
    const response = await fetch(
      `${process.env.AXIOM_URL ?? 'https://api.axiom.co'}/v1/datasets/${encodeURIComponent(dataset)}/ingest`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(events),
        signal: AbortSignal.timeout(10_000),
      },
    )
    return response.ok ? 'shipped' : `refused: HTTP ${response.status}`
  } catch (error) {
    // A probe that fails because its own telemetry sink is down reports the
    // wrong outage.
    return `unreachable: ${error instanceof Error ? error.message : String(error)}`
  }
}

const results = []
for (const target of TARGETS) {
  results.push(await probe(target))
}

const events = results.map((r) => ({
  _time: new Date().toISOString(),
  level: r.status === 200 && r.duration_ms <= BUDGET_MS ? 'info' : 'error',
  event: 'synthetic.probe',
  target: r.name,
  route: r.path,
  status: r.status,
  duration_ms: r.duration_ms,
  cache_status: r.cache_status,
  attempts: r.attempts,
  base: BASE,
  budget_ms: BUDGET_MS,
  ...(r.error ? { error: r.error } : {}),
}))

for (const event of events) console.log(JSON.stringify(event))

const shipped = await shipToAxiom(events)
console.log(JSON.stringify({ event: 'synthetic.shipped', outcome: shipped }))

const failures = results.filter((r) => r.status !== 200 || r.duration_ms > BUDGET_MS)

if (failures.length === 0) {
  const hits = results.filter((r) => r.cache_status === 'HIT').length
  console.log(
    `OK: ${results.length}/${results.length} targets answered 200 within ${BUDGET_MS}ms on ${BASE} (${hits} served from the edge cache).`,
  )
  process.exit(0)
}

for (const f of failures) {
  const why =
    f.status !== 200
      ? f.error
        ? `no answer (${f.error})`
        : `HTTP ${f.status}`
      : `${f.duration_ms}ms over a ${BUDGET_MS}ms budget`
  console.error(`FAIL ${f.name} ${BASE}${f.path}: ${why} after ${f.attempts} attempt(s)`)
}
process.exit(1)
