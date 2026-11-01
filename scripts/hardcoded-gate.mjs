#!/usr/bin/env node
/**
 * Diff-scoped hardcoded hex/px gate.
 *
 * Default range: HEAD~1..HEAD (see ci-diff-files.mjs).
 * Baseline: the HIGHER of the file's hit count in the base tree and its rows in
 * docs/hardcoded-audit.md, both read at the left of the range so a branch cannot
 * raise its own baseline. Existing debt does not block. Only an increase in a
 * changed file (or hits in a file that did not exist at the base) fails.
 *
 * The base tree half is there because the ledger is a dated snapshot: a file
 * created after the last regeneration has no rows, and without it the gate reads
 * a baseline of 0 and reports the whole file as new the first time anyone edits
 * it. See baselineFromBaseTree in hardcoded-gate-lib.mjs for the case that
 * proved it.
 *
 * Definition-layer files (tokens, globals) are advisory.
 *
 * Exit: 0 clean / nothing to scan, 1 new hardcoded values in gated files.
 */

import { existsSync, readFileSync } from 'node:fs'
import { extname } from 'node:path'
import { blankCommentLines, hasBlockComments } from '../src/lib/source-scan/strip-comments.mjs'
import { changedFiles, git, resolveRange } from './ci-diff-files.mjs'
import { baselineFromBaseTree, leftOf, parseLedger, scanContent } from './hardcoded-gate-lib.mjs'

const LEDGER = 'docs/hardcoded-audit.md'
const SCAN_EXTS = new Set(['.ts', '.tsx', '.css'])

const ADVISORY_FILES = new Set([
  'src/styles/tokens.ts',
  'src/app/globals.css',
  'src/lib/category-tokens.ts',
  'src/lib/electro-hero-tokens.ts',
  'src/lib/ke-live-revslider-slides.ts',
])

const isAdvisory = (file) => ADVISORY_FILES.has(file)

/**
 * Comment text removed, LINE NUMBERING KEPT, because this gate prints file:line.
 *
 * Was a per-line classifier, which cannot see that a line sits inside a block
 * that opened earlier: a literal on a continuation line not beginning with a
 * star was reported as hardcoded code. Shared with every other scanner here,
 * after eight guards had each matched their own prose - see the module header.
 */
const scannableLines = (file, content) =>
  blankCommentLines(content.split(/\r?\n/).join('\n'), { block: hasBlockComments(file) })

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
  try {
    return scanContent(readFileSync(file, 'utf8'))
  } catch {
    return []
  }
  const hits = []
  const lines = scannableLines(file, content)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
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
  const left = leftOf(range)
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
const fromBaseTree = []
let carried = 0

const left = leftOf(range)
for (const file of files) {
  const hits = scanFile(file)
  const ledgerCount = baseline[file] ?? 0
  // The ledger is a dated snapshot and the base tree is the fact. Take whichever
  // is higher: the ledger can carry rows for a file the base no longer has, and
  // the base carries files the ledger has never been regenerated to include.
  const inBaseTree = baselineFromBaseTree(file, left)
  const before = Math.max(ledgerCount, inBaseTree ?? 0)
  if (inBaseTree !== null && inBaseTree > ledgerCount) {
    fromBaseTree.push({ file, ledgerCount, inBaseTree })
  }
  if (hits.length <= before) {
    carried += hits.length
    continue
  }
  const entry = { file, now: hits.length, before, hits }
  if (isAdvisory(file)) advisory.push(entry)
  else regressions.push(entry)
}

if (fromBaseTree.length > 0) {
  console.log(
    `hardcoded-gate: ${fromBaseTree.length} file(s) scored against ${left} rather than the ledger, which is older than they are:`,
  )
  for (const { file, ledgerCount, inBaseTree } of fromBaseTree) {
    console.log(`  ${file}  ledger ${ledgerCount}, ${left} ${inBaseTree}`)
  }
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
