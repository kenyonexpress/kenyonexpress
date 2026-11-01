/**
 * The parts of the hardcoded gate that are decisions rather than plumbing.
 *
 * They live here so `scripts/hardcoded-gate.test.mjs` can import them. The gate
 * itself is a CLI that scans, prints and calls process.exit, so importing THAT
 * from a test runs the gate and takes the runner down with it.
 */

import { git } from './ci-diff-files.mjs'

export const HEX_RE = /#[0-9a-fA-F]{3,8}\b/g
export const PX_RE = /\b\d+(?:\.\d+)?px\b/g

export function isTrivialComment(line) {
  const t = line.trim()
  if (t.startsWith('//')) return true
  if (t.startsWith('*')) return true
  if (t.startsWith('/*') && t.endsWith('*/')) return true
  return false
}

export function collectMatches(re, line) {
  const out = []
  re.lastIndex = 0
  let m = re.exec(line)
  while (m !== null) {
    out.push(m[0])
    m = re.exec(line)
  }
  return out
}

export function scanContent(content) {
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

export function parseLedger(text) {
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

/** The commit the range is measured FROM. Everything baseline-shaped reads it. */
export function leftOf(range) {
  return range.includes('..') ? range.split(/\.{2,3}/)[0] : 'HEAD~1'
}

/**
 * WHAT THE FILE ITSELF HELD AT THE BASE, WHICH IS THE QUESTION THE LEDGER ONLY
 * APPROXIMATES.
 *
 * The rule this gate enforces is "no INCREASE in a changed file". Until now the
 * previous count came from docs/hardcoded-audit.md alone, and that ledger is a
 * dated snapshot: any file created after the last regeneration has no row, reads
 * as a baseline of 0, and reports its entire contents as new the first time
 * anybody touches it.
 *
 * Measured 2026-09-09, and it cost a green pull request. `src/lib/email/magic-link.ts`
 * is on main and holds 29 hits there (6 hex, 23 px). #34 touched the file and
 * LOWERED it to 23 by replacing the six literal colours with imported constants.
 * The gate reported `0 -> 23` and blocked, because the ledger predates the file.
 *
 * Reading the base tree answers it exactly, and it cannot be laundered: a branch
 * can rewrite the ledger, but it cannot rewrite what the base commit contains.
 * A file absent at the base is genuinely new and still starts from 0.
 */
export function baselineFromBaseTree(file, left) {
  const atBase = git(['show', `${left}:${file}`], { allowFailure: true })
  return atBase === null ? null : scanContent(atBase).length
}
