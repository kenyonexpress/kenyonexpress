#!/usr/bin/env node
/**
 * LCP AND TTFB AGAINST THE DEPLOYMENT, OVER A REAL NETWORK.
 *
 * docs/PERF-REPORT.md carried "LCP 1.2 s home" and "TTFB 10 ms" with an honest
 * caveat attached to each: the LCP was Lighthouse's Lantern SIMULATION over a
 * localhost graph, and the 10 ms was a warm local server with no DNS, no TLS
 * and no network. Both caveats were right and neither could be closed from this
 * machine, because there was nothing deployed to measure.
 *
 * There is now. `scripts/audit-deployed-build.mjs` established that
 * kenyonexpress.vercel.app is serving, so these numbers come from a browser and
 * a socket rather than from a model.
 *
 * IT PRINTS WHICH BUILD IT MEASURED, and that is not decoration. The deployment
 * is stale - the build predates 2026-09-02 - so these figures describe THAT
 * build and not the working tree. Publishing them without the bracket would
 * hand someone a real-looking number for code that has never run in production,
 * which is the same error as reporting a cart's metrics under checkout's name.
 *
 * WHAT IT REPORTS, PRECISELY, because the obvious reading is wrong. Node's
 * `fetch` pools connections, and the build-bracket probe above has already
 * opened one to this origin before the first sample runs. So every number here
 * is first byte on an ESTABLISHED connection - the server's own think-time plus
 * one round trip - and NOT what a first-time visitor waits.
 *
 * Measured 2026-09-08, both ways, which is why this distinction is written down
 * rather than assumed:
 *
 *   curl, full handshake   187-216 ms   median 207   DNS + TCP + TLS + server
 *   curl, minus appconnect  73-109 ms   median  88   server alone
 *   this script             76- 92 ms   median  90   server + one RTT, pooled
 *
 * The third agrees with the second, which is the check that this is measuring
 * what it claims. Compare it against the 200 ms budget as a SERVER figure. The
 * shopper-facing number is the first row, and it sits at the budget rather than
 * under it - roughly 120 ms of it is the TLS handshake from this location.
 *
 * The first sample is still reported separately: on a cold FUNCTION it is the
 * real experience, and it is a terrible sample of the rest.
 *
 *   node scripts/measure-live-vitals.mjs
 *   BASE=https://example.com SAMPLES=5 node scripts/measure-live-vitals.mjs
 */
import { DEFAULT_BASE, MARKERS, bracket, isPresent } from './audit-deployed-build.mjs'

export const ROUTES = ['/', '/coupons', '/products']
export const LCP_BUDGET_MS = 2000
export const TTFB_BUDGET_MS = 200

export function median(values) {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

/** A cold first hit is a real user experience and a terrible sample of the rest. */
export function splitCold(samples) {
  return { cold: samples[0] ?? null, warm: samples.slice(1) }
}

export function verdict(value, budget) {
  if (value === null) return 'UNMEASURED'
  return value <= budget ? 'ok' : 'OVER'
}

async function buildBracket(base) {
  const results = []
  for (const marker of MARKERS) {
    try {
      const res = await fetch(base + marker.path, {
        redirect: 'manual',
        signal: AbortSignal.timeout(20_000),
      })
      results.push({ ...marker, present: isPresent(res.status, marker.expect) })
    } catch {
      results.push({ ...marker, present: false })
    }
  }
  return bracket(results)
}

async function main() {
  const base = process.env.BASE ?? DEFAULT_BASE
  const samples = Number(process.env.SAMPLES ?? 6)

  const { newestPresent, oldestAbsent } = await buildBracket(base)
  if (!newestPresent) {
    console.error(`measure-live-vitals: ${base} did not answer. Nothing measured.`)
    process.exit(2)
  }

  console.log(`base ${base}`)
  console.log(
    oldestAbsent
      ? `build  carries markers up to ${newestPresent}, PREDATES ${oldestAbsent} - these numbers describe that build\n`
      : `build  carries every marker, newest ${newestPresent}\n`,
  )

  let failed = 0
  for (const route of ROUTES) {
    const wire = []
    for (let i = 0; i < samples; i += 1) {
      const started = performance.now()
      // `fetch` RESOLVES ON HEADERS, and that is the first byte. The first
      // version of this measured after `arrayBuffer()`, which is the whole
      // download, and reported 1312 ms where curl's `time_starttransfer` said
      // 207 ms - a transfer time wearing a TTFB label, which is the same class
      // of mistake this file exists to correct in the documentation.
      const res = await fetch(base + route, {
        redirect: 'manual',
        signal: AbortSignal.timeout(30_000),
      }).catch(() => null)
      if (!res) continue
      wire.push(performance.now() - started)
      // Drained after the clock stops, so the body does not enter the number,
      // and drained at all so the socket is not left half-read between samples.
      await res.arrayBuffer().catch(() => null)
    }
    const { cold, warm } = splitCold(wire)
    const warmMedian = median(warm)
    const flag = verdict(warmMedian, TTFB_BUDGET_MS)
    if (flag === 'OVER') failed += 1
    console.log(
      `  ${route.padEnd(11)} pooled first ${cold === null ? '  n/a' : `${Math.round(cold)}ms`}  median ${warmMedian === null ? 'n/a' : `${Math.round(warmMedian)}ms`}  server budget ${TTFB_BUDGET_MS}  ${flag}`,
    )
  }
  console.log('\nLCP needs a browser; see docs/PERF-REPORT.md for the recorded run.')
  process.exit(failed > 0 ? 1 : 0)
}

if (import.meta.url === `file://${process.argv[1]}`) await main()
