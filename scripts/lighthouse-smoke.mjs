#!/usr/bin/env node
/**
 * Smoke Lighthouse against LOCAL_BASE (default http://localhost:3000).
 * Prints category scores; exits 1 if Performance or Accessibility < 90.
 *
 * Usage (Terminal):
 *   pnpm build && pnpm start
 *   node scripts/lighthouse-smoke.mjs
 *   node scripts/lighthouse-smoke.mjs --url=/product/demo
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
