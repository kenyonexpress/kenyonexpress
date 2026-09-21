#!/usr/bin/env node
/**
 * Turn one or more k6 `--summary-export` files into the table that
 * docs/LOAD-TEST-RESULTS.md records, one row per tagged leg, with p50, p95,
 * p99 and max -- the stats `load/lib/summary.js` asks k6 to keep.
 *
 *   node scripts/load-summary.mjs browse.json [spike.json ...]
 *
 * Two things about k6's export that are easy to get backwards:
 *
 *  - `med` is p50. There is no `p(50)` key unless it was asked for by that
 *    name, and asking would print the same number twice.
 *  - In the `thresholds` map of a metric, `true` means the threshold was
 *    CROSSED, not met. A leg reads as green only when every value is false.
 *    Read as "ok: true", a failed run prints as a passed one.
 *
 * A leg with no samples (`max === 0` and no `count`) is left out rather than
 * printed as a row of zeros: k6 emits a sub-metric for every threshold that
 * names a tag, whether or not a request ever carried it, and a 0ms p95 for a
 * leg that never ran looks like the best result in the table.
 */

import { readFileSync } from 'node:fs'
import { basename } from 'node:path'

const LEG = /^http_req_duration\{(\w+):([^}]+)\}$/

function ms(value) {
  return typeof value === 'number' ? `${Math.round(value)}ms` : '—'
}

/** Rows for every tagged latency sub-metric that saw at least one sample. */
export function legs(summary) {
  const rows = []
  for (const [name, metric] of Object.entries(summary.metrics ?? {})) {
    const match = LEG.exec(name)
    if (!match) continue
    const [, tag, value] = match
    if (tag === 'expected_response') continue
    const stats = metric ?? {}
    if (!(stats.max > 0)) continue
    const thresholds = Object.entries(stats.thresholds ?? {})
    const crossed = thresholds.filter(([, failed]) => failed === true).map(([expr]) => expr)
    rows.push({
      leg: `${tag}:${value}`,
      p50: stats.med,
      p95: stats['p(95)'],
      p99: stats['p(99)'],
      max: stats.max,
      gated: thresholds.length > 0,
      crossed,
    })
  }
  return rows.sort((a, b) => a.leg.localeCompare(b.leg))
}

/** The scalar lines that qualify every row above. */
export function totals(summary) {
  const metrics = summary.metrics ?? {}
  const rate = (metric) => (typeof metric?.value === 'number' ? metric.value : undefined)
  return {
    requests: metrics.http_reqs?.count,
    iterations: metrics.iterations?.count,
    failed: rate(metrics.http_req_failed),
    rateLimited: rate(metrics.rate_limited),
    checks: rate(metrics.checks),
  }
}

function percent(value) {
  return typeof value === 'number' ? `${(value * 100).toFixed(2)}%` : '—'
}

export function render(summary, label) {
  const rows = legs(summary)
  const t = totals(summary)
  const lines = [
    `### ${label}`,
    '',
    `requests ${t.requests ?? '—'}, iterations ${t.iterations ?? '—'}, failed ${percent(t.failed)}, rate-limited ${percent(t.rateLimited)}, checks ${percent(t.checks)}`,
    '',
    '| leg | p50 | p95 | p99 | max | gate |',
    '| --- | --- | --- | --- | --- | --- |',
  ]
  for (const row of rows) {
    const gate = !row.gated ? '—' : row.crossed.length === 0 ? '✅' : `❌ ${row.crossed.join(', ')}`
    lines.push(
      `| ${row.leg} | ${ms(row.p50)} | ${ms(row.p95)} | ${ms(row.p99)} | ${ms(row.max)} | ${gate} |`,
    )
  }
  if (rows.length === 0) lines.push('| (no tagged leg saw a request) | | | | | |')
  return lines.join('\n')
}

const isMain = process.argv[1] && basename(process.argv[1]) === 'load-summary.mjs'
if (isMain) {
  const files = process.argv.slice(2)
  if (files.length === 0) {
    console.error('usage: node scripts/load-summary.mjs <summary.json> [...]')
    process.exit(2)
  }
  const out = files.map((file) =>
    render(JSON.parse(readFileSync(file, 'utf8')), basename(file, '.json')),
  )
  console.log(out.join('\n\n'))
}
