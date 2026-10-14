// XF04: turn two Playwright json reporter outputs into the tables that
// docs/E2E-STATUS.md carries, and name every case whose outcome differed
// between the two runs (passed once, failed once) as flaky.
//
// Usage: node logs/xf04/summarize.mjs /tmp/xf04/run1.json /tmp/xf04/run2.json
import { readFileSync } from 'node:fs'

const [runA, runB] = process.argv.slice(2).map((p) => JSON.parse(readFileSync(p, 'utf8')))
if (!runA || !runB) {
  console.error('usage: summarize.mjs <run1.json> <run2.json>')
  process.exit(2)
}

/**
 * The json reporter keeps the colour codes of the terminal message. The
 * escape byte is built from its code point so biome's control-character
 * rule does not fire on a literal.
 */
const ANSI_SEQUENCE = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g')
const stripAnsi = (text) => text.replace(ANSI_SEQUENCE, '')

/** Flatten the nested suites into one row per (file, title, project). */
function cases(report) {
  const rows = []
  const walk = (suite, file, titles) => {
    const path = suite.title && suite.title !== file ? [...titles, suite.title] : titles
    for (const spec of suite.specs ?? []) {
      for (const t of spec.tests ?? []) {
        const last = t.results.at(-1)
        rows.push({
          file,
          title: [...path, spec.title].join(' › '),
          project: t.projectName,
          status: t.status,
          outcome: last?.status ?? 'none',
          duration: t.results.reduce((s, r) => s + (r.duration ?? 0), 0),
          error: stripAnsi(last?.error?.message?.split('\n')[0] ?? ''),
        })
      }
    }
    for (const child of suite.suites ?? []) walk(child, file, path)
  }
  for (const top of report.suites ?? []) walk(top, top.file ?? top.title, [])
  return rows
}

function perFile(rows) {
  const files = new Map()
  for (const r of rows) {
    const f = files.get(r.file) ?? { file: r.file, passed: 0, failed: 0, skipped: 0, ms: 0 }
    if (r.status === 'skipped') f.skipped += 1
    else if (r.status === 'expected' || r.status === 'flaky') f.passed += 1
    else f.failed += 1
    f.ms += r.duration
    files.set(r.file, f)
  }
  return [...files.values()].sort((a, b) => a.file.localeCompare(b.file))
}

const mmss = (ms) => {
  const s = Math.round(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

const a = cases(runA)
const b = cases(runB)
const key = (r) => `${r.file}|${r.project}|${r.title}`
const byKeyB = new Map(b.map((r) => [key(r), r]))

const flaky = []
for (const r of a) {
  const other = byKeyB.get(key(r))
  if (!other) continue
  const passA = r.status === 'expected' || r.status === 'flaky'
  const passB = other.status === 'expected' || other.status === 'flaky'
  if (r.status === 'skipped' || other.status === 'skipped') continue
  if (passA !== passB) flaky.push({ ...r, run1: r.status, run2: other.status, errB: other.error })
}
const failedBoth = a.filter((r) => {
  const other = byKeyB.get(key(r))
  return r.status === 'unexpected' && other?.status === 'unexpected'
})

const totals = (report, rows) => ({
  passed: rows.filter((r) => r.status === 'expected' || r.status === 'flaky').length,
  failed: rows.filter((r) => r.status === 'unexpected').length,
  skipped: rows.filter((r) => r.status === 'skipped').length,
  total: rows.length,
  duration: report.stats?.duration ?? 0,
  start: report.stats?.startTime ?? '',
})

const out = []
out.push('| run | passed | failed | skipped | total | wall time | started |')
out.push('| --- | --- | --- | --- | --- | --- | --- |')
for (const [i, [rep, rows]] of [
  [runA, a],
  [runB, b],
].entries()) {
  const t = totals(rep, rows)
  out.push(
    `| ${i + 1} | ${t.passed} | ${t.failed} | ${t.skipped} | ${t.total} | ${mmss(t.duration)} | ${t.start.replace('T', ' ').slice(0, 19)}Z |`,
  )
}
out.push('')
out.push(
  '| suite (spec file) | run 1 pass / fail / skip | run 1 time | run 2 pass / fail / skip | run 2 time |',
)
out.push('| --- | --- | --- | --- | --- |')
const fa = perFile(a)
const fb = new Map(perFile(b).map((f) => [f.file, f]))
for (const f of fa) {
  const g = fb.get(f.file) ?? { passed: 0, failed: 0, skipped: 0, ms: 0 }
  out.push(
    `| ${f.file} | ${f.passed} / ${f.failed} / ${f.skipped} | ${mmss(f.ms)} | ${g.passed} / ${g.failed} / ${g.skipped} | ${mmss(g.ms)} |`,
  )
}
out.push('')
out.push(`flaky (outcome differed between the runs): ${flaky.length}`)
for (const r of flaky) {
  out.push(
    `- ${r.file} [${r.project}] ${r.title}: run 1 ${r.run1}, run 2 ${r.run2}; ${r.error || r.errB}`,
  )
}
out.push(`failed in both runs: ${failedBoth.length}`)
for (const r of failedBoth) out.push(`- ${r.file} [${r.project}] ${r.title}: ${r.error}`)
out.push('')
out.push('skipped (same in both runs unless noted):')
for (const r of a.filter((r) => r.status === 'skipped')) {
  const other = byKeyB.get(key(r))
  out.push(
    `- ${r.file} [${r.project}] ${r.title}${other?.status === 'skipped' ? '' : ` (run 2: ${other?.status})`}`,
  )
}
console.log(out.join('\n'))
