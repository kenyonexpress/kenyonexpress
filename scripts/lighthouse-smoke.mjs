#!/usr/bin/env node
/**
 * Smoke Lighthouse against LOCAL_BASE (default http://localhost:3000).
 * Prints category scores; exits 1 if Performance or Accessibility < 90.
 *
 * Usage (Terminal):
 *   pnpm build && pnpm start
 *   node scripts/lighthouse-smoke.mjs
 *   node scripts/lighthouse-smoke.mjs --url=/product/demo
 *
 * READ docs/PERFORMANCE-BUDGET.md BEFORE ACTING ON A RED FROM THIS SCRIPT.
 *
 * Lighthouse's default throttling is `simulate`: it loads the page unthrottled
 * and then MODELS a mid-tier phone on 4G (4x CPU, 150ms RTT, ~1.6 Mbps). On
 * localhost that model is extrapolating from a machine that is also serving the
 * page, and it is unstable -- three consecutive runs on an unchanged tree
 * returned 75, 70 and 70. Measured 2026-09-06, the same build scores 70-75 here
 * and 100 with `--throttling-method=provided`, with FCP 0.1s, LCP 0.2s, TBT 0ms
 * and no render-blocking resources.
 *
 * So a red from this script on localhost is not evidence of a regression, and a
 * green would not be evidence of a fix -- a 2.7s real improvement has already
 * been measured showing up as noise in this metric. To ask what the build
 * actually does rather than what a modelled phone would see:
 *
 *   pnpm exec lighthouse <url> --only-categories=performance \
 *     --throttling-method=provided --chrome-flags="--headless --no-sandbox"
 *
 * The threshold below is NOT the thing that is wrong. Point this at a real
 * deployment before changing it.
 */

import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const LOCAL = process.env.LOCAL_BASE ?? 'http://localhost:3000'
const argUrl = process.argv.find((a) => a.startsWith('--url='))?.slice(6)
const target = argUrl
  ? argUrl.startsWith('http')
    ? argUrl
    : `${LOCAL}${argUrl.startsWith('/') ? '' : '/'}${argUrl}`
  : `${LOCAL}/`

const out = resolve('refs/lighthouse-smoke.json')
const result = spawnSync(
  'pnpm',
  [
    'exec',
    'lighthouse',
    target,
    '--only-categories=performance,accessibility,seo',
    '--chrome-flags=--headless --no-sandbox',
    '--output=json',
    `--output-path=${out}`,
    '--quiet',
  ],
  { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
)

if (result.status !== 0) {
  console.error(result.stderr || result.stdout || 'lighthouse failed')
  process.exit(result.status ?? 1)
}

const report = JSON.parse(readFileSync(out, 'utf8'))
const scores = {
  performance: Math.round((report.categories.performance?.score ?? 0) * 100),
  accessibility: Math.round((report.categories.accessibility?.score ?? 0) * 100),
  seo: Math.round((report.categories.seo?.score ?? 0) * 100),
}

console.log(`=== lighthouse ${target} ===`)
console.log(scores)

const failed = scores.performance < 90 || scores.accessibility < 90
process.exit(failed ? 1 : 0)
