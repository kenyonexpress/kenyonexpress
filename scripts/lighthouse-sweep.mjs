#!/usr/bin/env node
/**
 * MISSION-FINAL stage 8: Lighthouse on EVERY public route, not one smoke URL.
 *
 * `scripts/lighthouse-smoke.mjs` runs a single page and is the CI gate. This is
 * the audit: it walks the whole public surface, records the four category
 * scores and the handful of audits that actually differ between our pages, and
 * writes docs/LIGHTHOUSE-AUDIT.md.
 *
 * READ THE NUMBERS THE RIGHT WAY. Against localhost, Lighthouse's mobile LCP is
 * a Lantern simulation over a graph that contains the whole page, so it tracks
 * total load and not the LCP element (measured 2026-08-01: reported 5.1s while
 * observedLargestContentfulPaint in the same report was 615ms). Performance
 * here is a relative signal across routes and a way to catch render-blocking,
 * unused JS and server-response regressions -- not a field score.
 *
 * Usage: BASE=http://localhost:3455 node scripts/lighthouse-sweep.mjs [--only=home,cart]
 */
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const BASE = process.env.BASE ?? 'http://localhost:3455'
const only = process.argv
  .find((a) => a.startsWith('--only='))
  ?.slice(7)
  ?.split(',')

const ROUTES = [
  ['home', '/'],
  ['catalogue', '/products'],
  ['category', '/category/hot-deals'],
  ['product (physical)', '/product/airpods-pro-2'],
  ['product (coupon)', '/product/demo-coupon-1'],
  ['coupons', '/coupons'],
  ['search', '/search?q=%D7%9E%D7%95%D7%A6%D7%A8'],
  ['cart', '/cart'],
  ['checkout', '/checkout'],
  ['login', '/login'],
  ['signup', '/signup'],
  ['suppliers', '/suppliers'],
  ['supplier login', '/supplier/login'],
  ['contact', '/contact'],
  ['legal terms', '/legal/terms'],
  ['legal privacy', '/legal/privacy'],
  ['legal returns', '/legal/returns'],
  ['legal accessibility', '/legal/accessibility'],
  ['not found', '/this-route-does-not-exist'],
]

const targets = only ? ROUTES.filter(([name]) => only.includes(name)) : ROUTES
const outDir = mkdtempSync(join(tmpdir(), 'ke-lh-'))
const rows = []

for (const [name, path] of targets) {
  const url = BASE + path
  const out = join(outDir, `${name.replace(/\W+/g, '-')}.json`)
  const res = spawnSync(
    'pnpm',
    [
      'exec',
      'lighthouse',
      url,
      '--only-categories=performance,accessibility,best-practices,seo',
      '--chrome-flags=--headless=new --no-sandbox',
      '--output=json',
      `--output-path=${out}`,
      '--quiet',
    ],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  )
  if (res.status !== 0) {
    rows.push({
      name,
      path,
      error: (res.stderr || res.stdout || 'lighthouse failed').split('\n')[0],
    })
    console.log(`ERR  ${name}`)
    continue
  }
  const r = JSON.parse(readFileSync(out, 'utf8'))
  const pct = (c) =>
    r.categories[c]?.score == null ? null : Math.round(r.categories[c].score * 100)
  const audit = (id) => r.audits[id]
  const row = {
    name,
    path,
    status: r.audits['network-requests']?.details?.items?.[0]?.statusCode ?? null,
    perf: pct('performance'),
    a11y: pct('accessibility'),
    bp: pct('best-practices'),
    seo: pct('seo'),
    // Simulated. Kept for cross-route comparison only, per the header note.
    lcp: audit('largest-contentful-paint')?.numericValue,
    // Observed, unthrottled: the honest paint time on this machine.
    observedLcp: r.audits.metrics?.details?.items?.[0]?.observedLargestContentfulPaint ?? null,
    tbt: audit('total-blocking-time')?.numericValue,
    cls: audit('cumulative-layout-shift')?.numericValue,
    ttfb: audit('server-response-time')?.numericValue,
    renderBlocking: audit('render-blocking-resources')?.details?.overallSavingsMs ?? 0,
    unusedJs: Math.round((audit('unused-javascript')?.details?.overallSavingsBytes ?? 0) / 1024),
    a11yFails: (r.categories.accessibility?.auditRefs ?? [])
      .filter((ref) => r.audits[ref.id]?.score !== null && r.audits[ref.id]?.score < 1)
      .map((ref) => ref.id),
    seoFails: (r.categories.seo?.auditRefs ?? [])
      .filter((ref) => r.audits[ref.id]?.score !== null && r.audits[ref.id]?.score < 1)
      .map((ref) => ref.id),
    bpFails: (r.categories['best-practices']?.auditRefs ?? [])
      .filter((ref) => r.audits[ref.id]?.score !== null && r.audits[ref.id]?.score < 1)
      .map((ref) => ref.id),
  }
  rows.push(row)
  console.log(
    `${String(row.perf).padStart(3)} ${String(row.a11y).padStart(3)} ${String(row.bp).padStart(3)} ${String(row.seo).padStart(3)}  ${name}`,
  )
}

writeFileSync(resolve('refs/lighthouse-sweep.json'), JSON.stringify(rows, null, 2))
console.log(`\nwrote refs/lighthouse-sweep.json (${rows.length} routes, reports in ${outDir})`)
