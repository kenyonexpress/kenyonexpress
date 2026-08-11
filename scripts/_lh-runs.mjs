/**
 * Runs Lighthouse mobile N times against one URL and prints the numbers this
 * project actually acts on, one row per run.
 *
 * Deliberately NOT a preset: `--preset=perf` skips artifacts and reported 88 on
 * the same build where the default mobile run reports 80. Every number in
 * STATE.md from [15] onward came from a default mobile run, so this stays the
 * default mobile run.
 *
 * Usage: node scripts/_lh-runs.mjs <url> [runs] [label]
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, rmSync } from 'node:fs'

const url = process.argv[2]
const runs = Number(process.argv[3] ?? 3)
const label = process.argv[4] ?? 'run'
if (!url) {
  console.error('usage: node scripts/_lh-runs.mjs <url> [runs] [label]')
  process.exit(1)
}

const AUDITS = [
  ['FCP', 'first-contentful-paint'],
  ['LCP', 'largest-contentful-paint'],
  ['SI', 'speed-index'],
  ['TBT', 'total-blocking-time'],
  ['CLS', 'cumulative-layout-shift'],
  ['TTFB', 'server-response-time'],
  ['blocking', 'render-blocking-insight'],
  ['unusedJS', 'unused-javascript'],
  ['legacyJS', 'legacy-javascript'],
]

const rows = []
for (let i = 1; i <= runs; i++) {
  const out = `/tmp/lh-${label}-${i}.json`
  rmSync(out, { force: true })
  execFileSync(
    'pnpm',
    [
      'dlx',
      'lighthouse',
      url,
      '--only-categories=performance',
      '--output=json',
      `--output-path=${out}`,
      '--chrome-flags=--headless=new --no-sandbox',
      '--quiet',
    ],
    { stdio: ['ignore', 'ignore', 'inherit'] },
  )
  const r = JSON.parse(readFileSync(out, 'utf8'))
  const row = { run: i, score: Math.round(r.categories.performance.score * 100) }
  for (const [name, id] of AUDITS) {
    const a = r.audits[id]
    row[name] = a
      ? (a.displayValue || String(a.numericValue ?? '')).replace(/^Est savings of /, '')
      : '-'
  }
  rows.push(row)
  console.log(`${label} #${i}:`, JSON.stringify(row))
}

const scores = rows.map((r) => r.score)
console.log(
  `\n${label} scores: ${scores.join(' / ')}  (median ${scores.sort((a, b) => a - b)[Math.floor(runs / 2)]})`,
)
