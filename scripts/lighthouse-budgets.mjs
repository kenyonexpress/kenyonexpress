#!/usr/bin/env node
/**
 * Web-vitals budgets for the two pages that carry the shop: the home page and a
 * product page. Fails the process when either blows a budget.
 *
 *   LCP < 2500ms
 *   CLS < 0.1
 *
 * Usage (from the repo root, against a PRODUCTION build - `next dev` is a
 * different application for performance purposes):
 *
 *   pnpm build
 *   PORT=3311 pnpm start &
 *   LOCAL_BASE=http://localhost:3311 pnpm lighthouse:budgets
 *
 * WHY A SCRIPT AND NOT @lhci/cli. `lighthouse` is already a devDependency and
 * `npm install` cannot run in this repo at all (see AGENTS.md), so adding an
 * lhci dependency to express two assertions is a cost with no return.
 * .lighthouserc.cjs carries the same two numbers for anyone who does run lhci,
 * and BUDGETS below is the single place they are written down.
 *
 * WHAT THE NUMBER ACTUALLY MEANS ON LOCALHOST, STATED PLAINLY. Lighthouse's
 * default throttling is `simulate`: it records an unthrottled trace and then
 * runs Lantern over the request graph to predict what the page would do on a
 * slow 4G phone. The prediction covers the whole page, so a real improvement to
 * the LCP element can land inside the run-to-run noise - this project has
 * already watched a measured 2.7s improvement show up as a rounding error.
 *
 * Two consequences, both deliberate:
 *   - The gate is a REGRESSION gate, not a field measurement. It catches a page
 *     that got structurally slower (a render-blocking script, an unsized image,
 *     a font swap), which is what a PR can introduce.
 *   - CLS is the trustworthy half. It is observed rather than simulated, and a
 *     layout shift on localhost is a layout shift everywhere.
 *
 * LH_THROTTLING=provided switches to measuring the machine it runs on, which is
 * useful locally and meaningless as a shared budget; CI leaves it alone.
 */

import { spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const BASE = (process.env.LOCAL_BASE ?? 'http://localhost:3000').replace(/\/$/, '')
const OUT_DIR = resolve(process.env.LH_OUT_DIR ?? 'lighthouse-reports')

/** The budgets. One place, read by the runner and echoed in .lighthouserc.cjs. */
const BUDGETS = {
  'largest-contentful-paint': {
    label: 'LCP',
    max: Number(process.env.LH_LCP_MS ?? 2500),
    unit: 'ms',
    format: (v) => `${Math.round(v)}ms`,
  },
  'cumulative-layout-shift': {
    label: 'CLS',
    max: Number(process.env.LH_CLS ?? 0.1),
    unit: '',
    format: (v) => v.toFixed(3),
  },
}

const PRESET = process.env.LH_PRESET ?? 'desktop'
const THROTTLING = process.env.LH_THROTTLING ?? 'simulate'
const RUNS = Number(process.env.LH_RUNS ?? 1)

/**
 * The product page to measure.
 *
 * Discovered from the rendered catalogue rather than pinned, because the slugs
 * are Hebrew and DB-driven: a hard-coded one 404s the moment the seed changes,
 * and a 404 page passes every performance budget there is. The seeded fixture
 * is preferred when it exists so CI measures the same page run to run.
 */
async function findProductUrl() {
  const explicit = process.env.LH_PRODUCT_URL
  if (explicit) return explicit.startsWith('http') ? explicit : `${BASE}${explicit}`

  for (const slug of ['e2e-test-physical', 'e2e-test-coupon']) {
    const probe = await fetch(`${BASE}/product/${slug}`, { redirect: 'follow' })
    if (probe.ok) return `${BASE}/product/${slug}`
  }

  const catalogue = await fetch(`${BASE}/products`)
  if (!catalogue.ok) {
    throw new Error(`cannot reach ${BASE}/products (${catalogue.status})`)
  }
  const html = await catalogue.text()
  const match = /href="(\/product\/[^"#?]+)"/.exec(html)
  if (!match?.[1]) {
    throw new Error(`no product link found on ${BASE}/products`)
  }
  return `${BASE}${match[1]}`
}

function runLighthouse(url, slug) {
  const outPath = resolve(OUT_DIR, `${slug}.json`)
  const args = [
    'exec',
    'lighthouse',
    url,
    '--only-categories=performance',
    '--chrome-flags=--headless=new --no-sandbox --disable-dev-shm-usage',
    `--preset=${PRESET}`,
    `--throttling-method=${THROTTLING}`,
    '--output=json',
    `--output-path=${outPath}`,
    '--quiet',
  ]

  const result = spawnSync('pnpm', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `lighthouse exited ${result.status}`)
  }
  return JSON.parse(readFileSync(outPath, 'utf8'))
}

/**
 * The median of N runs, per metric.
 *
 * One run is a sample of a noisy process, and a budget that fails on noise gets
 * ignored, which is worse than having no budget. LH_RUNS=3 in CI trades about
 * a minute for a gate people believe.
 */
function median(values) {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true })

  const targets = [
    { slug: 'home', url: `${BASE}/` },
    { slug: 'product', url: await findProductUrl() },
  ]

  const failures = []

  for (const { slug, url } of targets) {
    const samples = new Map(Object.keys(BUDGETS).map((id) => [id, []]))

    for (let run = 0; run < RUNS; run += 1) {
      const report = runLighthouse(url, RUNS > 1 ? `${slug}-${run + 1}` : slug)
      for (const id of samples.keys()) {
        const audit = report.audits?.[id]
        if (typeof audit?.numericValue !== 'number') {
          throw new Error(`${url}: lighthouse reported no ${id}`)
        }
        samples.get(id).push(audit.numericValue)
      }
    }

    console.log(`=== ${slug}: ${url} ===`)
    for (const [id, budget] of Object.entries(BUDGETS)) {
      const value = median(samples.get(id))
      const ok = value < budget.max
      console.log(
        `  ${ok ? 'PASS' : 'FAIL'}  ${budget.label} ${budget.format(value)} ` +
          `(budget < ${budget.format(budget.max)})`,
      )
      if (!ok) {
        failures.push(
          `${slug} ${budget.label} ${budget.format(value)} exceeds ${budget.format(budget.max)}`,
        )
      }
    }
  }

  console.log(`\nreports: ${OUT_DIR}`)

  if (failures.length > 0) {
    console.error(`\nweb-vitals budget failed:\n  ${failures.join('\n  ')}`)
    process.exit(1)
  }
  console.log('\nall budgets met')
}

main().catch((error) => {
  console.error(`lighthouse-budgets: ${error.message}`)
  process.exit(1)
})
