#!/usr/bin/env node
/**
 * Diff-scoped hardcoded hex/px gate.
 *
 * Default range: HEAD~1..HEAD (see ci-diff-files.mjs).
 * Baseline: docs/hardcoded-audit.md hit counts per file.
 * Existing ledger debt does not block. Only an increase in a changed file
 * (or hits in a new file with baseline 0) fails the gate.
 *
 * Definition-layer files (tokens, globals) are advisory.
 *
 * Exit: 0 clean / nothing to scan, 1 new hardcoded values in gated files.
 */

import { existsSync, readFileSync } from 'node:fs'
import { extname } from 'node:path'
import { changedFiles, git, resolveRange } from './ci-diff-files.mjs'

const LEDGER = 'docs/hardcoded-audit.md'
const SCAN_EXTS = new Set(['.ts', '.tsx', '.css'])
const HEX_RE = /#[0-9a-fA-F]{3,8}\b/g
const PX_RE = /\b\d+(?:\.\d+)?px\b/g

const ADVISORY_FILES = new Set([
  'src/styles/tokens.ts',
  'src/app/globals.css',
  'src/lib/category-tokens.ts',
  'src/lib/electro-hero-tokens.ts',
  'src/lib/ke-live-revslider-slides.ts',
])

const isAdvisory = (file) => ADVISORY_FILES.has(file)

function isTrivialComment(line) {
  const t = line.trim()
  if (t.startsWith('//')) return true
  if (t.startsWith('*')) return true
  if (t.startsWith('/*') && t.endsWith('*/')) return true
  return false
}

function collectMatches(re, line) {
  const out = []
  re.lastIndex = 0
  let m = re.exec(line)
  while (m !== null) {
    out.push(m[0])
    m = re.exec(line)
  }
  return out
}

function scanFile(file) {
  let content
  try {
    content = readFileSync(file, 'utf8')
  } catch {
    return []
  }
  const hits = []
  const lines = content.split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (isTrivialComment(line)) continue
    for (const value of collectMatches(HEX_RE, line)) hits.push({ line: i + 1, value })
    for (const value of collectMatches(PX_RE, line)) hits.push({ line: i + 1, value })
  }
  return hits
}

function parseLedger(text) {
  const counts = {}
  for (const line of text.split(/\r?\n/)) {
    if (!line.startsWith('|')) continue
    const cells = line.split('|').map((c) => c.trim())
    if (cells.length < 5) continue
    const file = cells[1]
    if (!file || file === 'File' || /^-+$/.test(file)) continue
    if (!Number.parseInt(cells[2], 10) && cells[2] !== '0') continue
    counts[file] = (counts[file] ?? 0) + 1
  }
  return counts
}

function loadBaseline(range) {
  // Prefer ledger at the left side of the range so the same commit cannot
  // launder new hits by rewriting the audit file.
  const left = range.includes('..') ? range.split(/\.{2,3}/)[0] : 'HEAD~1'
  const atBase = git(['show', `${left}:${LEDGER}`], { allowFailure: true })
  if (atBase !== null) return { counts: parseLedger(atBase), source: `${LEDGER} at ${left}` }
  if (existsSync(LEDGER)) {
    return { counts: parseLedger(readFileSync(LEDGER, 'utf8')), source: `${LEDGER} (working tree)` }
  }
  return { counts: {}, source: 'no ledger found (every hit counts as new)' }
}

const range = resolveRange()
const files = changedFiles({
  range,
  includeWorkingTree: !process.env.CI,
  predicate: (file) => file.startsWith('src/') && SCAN_EXTS.has(extname(file)),
})

if (files.length === 0) {
  console.log(`hardcoded-gate: no scannable src/ files in ${range}`)
  process.exit(0)
}

const { counts: baseline, source } = loadBaseline(range)
console.log(`hardcoded-gate: range ${range}`)
console.log(`hardcoded-gate: ${files.length} file(s), baseline from ${source}`)

const regressions = []
const advisory = []
let carried = 0

for (const file of files) {
  const hits = scanFile(file)
  const before = baseline[file] ?? 0
  if (hits.length <= before) {
    carried += hits.length
    continue
  }
  const entry = { file, now: hits.length, before, hits }
  if (isAdvisory(file)) advisory.push(entry)
  else regressions.push(entry)
}

if (carried > 0) {
  console.log(`hardcoded-gate: ${carried} pre-existing hit(s) within budget, not blocking`)
}

if (advisory.length > 0) {
  console.log('hardcoded-gate: definition-layer growth (advisory):')
  for (const { file, now, before } of advisory) console.log(`  ${file}  ${before} -> ${now}`)
}

if (regressions.length === 0) {
  console.log('hardcoded-gate: no new hardcoded values beyond docs/hardcoded-audit.md')
  process.exit(0)
}

console.error('\nhardcoded-gate: NEW hardcoded values in this commit (blocked):\n')
for (const { file, now, before, hits } of regressions) {
  console.error(`  ${file}  ${before} -> ${now}`)
  for (const hit of hits.slice(-Math.min(hits.length, now - before + 3))) {
    console.error(`      ${file}:${hit.line}  ${hit.value}`)
  }
}
const recorded = Object.values(baseline).reduce((a, b) => a + b, 0)
console.error(
  `\nExisting ${recorded} hit(s) in ${LEDGER} are debt and do not block.
Only increases on changed files fail the gate.`,
)
process.exit(1)
