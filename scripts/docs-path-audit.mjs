#!/usr/bin/env node
/**
 * EVERY REPO PATH A DOCUMENT NAMES IN BACKTICKS MUST RESOLVE, OR BE ON THE LEDGER.
 *
 * A document that points at `src/contracts/enums.ts` reads as a description of
 * code that exists. Following it costs a search that ends in nothing, and the
 * natural conclusion is that the reader is looking in the wrong place rather
 * than that the document is describing a structure nobody built. That is the
 * failure this catches.
 *
 * It is a RATCHET, not a cleanup. `docs/known-dangling-paths.json` holds the
 * references that are dangling today, each with the document that names it, and
 * this script fails on two things:
 *
 *   1. a dangling reference that is NOT on the ledger  (new rot)
 *   2. a ledger entry that now resolves               (fixed, so delete the row)
 *
 * The second half is the one that matters in six months: without it the ledger
 * grows into a list nobody trusts, and a genuine regression hides among rows
 * that stopped being true long ago.
 *
 * WHAT IT CANNOT SEE, so nobody reads more into a green run: a path written
 * without backticks, a path built from a variable, a path inside a fenced code
 * block that is illustrative rather than real, and whether a path that DOES
 * resolve is being described correctly. It checks existence, not accuracy.
 */
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const LEDGER = join(ROOT, 'docs', 'known-dangling-paths.json')

/** Top-level directories that make a backticked string a repo path claim. */
const TOPS = [
  'src/',
  'scripts/',
  'migrations/',
  'supabase/',
  'apps/',
  'public/',
  'data/',
  'docs/',
  '.github/',
  'e2e/',
  'refs/',
]

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (entry.endsWith('.md')) out.push(p)
  }
  return out
}

export function collectDangling(root = ROOT) {
  const found = []
  for (const file of walk(join(root, 'docs')).sort()) {
    const rel = file.slice(root.length + 1)
    const text = readFileSync(file, 'utf8')
    for (const m of text.matchAll(/`([^`\n]+)`/g)) {
      const s = m[1]
        .trim()
        .replace(/[),.:;]+$/, '')
        .replace(/:\d+(-\d+)?$/, '')
      if (!TOPS.some((t) => s.startsWith(t))) continue
      if (/[ *?<>|{}]/.test(s)) continue // globs and prose, not a single path
      if (!/\.[a-z0-9]+$/i.test(s) && !s.endsWith('/')) continue
      if (existsSync(join(root, s.replace(/\/$/, '')))) continue
      found.push(`${rel} :: ${s}`)
    }
  }
  return [...new Set(found)].sort()
}

const dangling = collectDangling()

if (process.argv.includes('--write')) {
  writeFileSync(LEDGER, `${JSON.stringify(dangling, null, 2)}\n`)
  console.log(
    `docs-path-audit: wrote ${dangling.length} entries to ${LEDGER.slice(ROOT.length + 1)}`,
  )
  process.exit(0)
}

const ledger = existsSync(LEDGER) ? JSON.parse(readFileSync(LEDGER, 'utf8')) : []
const known = new Set(ledger)
const now = new Set(dangling)

const added = dangling.filter((d) => !known.has(d))
const fixed = ledger.filter((d) => !now.has(d))

if (added.length === 0 && fixed.length === 0) {
  console.log(`docs-path-audit: OK. ${dangling.length} known dangling references, no change.`)
  process.exit(0)
}

if (added.length > 0) {
  console.error(`\ndocs-path-audit: ${added.length} NEW dangling repo path(s) in docs/:\n`)
  for (const a of added) console.error(`  + ${a}`)
  console.error('\nEither fix the path, or if it is deliberately aspirational, run:')
  console.error('  node scripts/docs-path-audit.mjs --write')
}
if (fixed.length > 0) {
  console.error(`\ndocs-path-audit: ${fixed.length} ledger entry(ies) NO LONGER dangling:\n`)
  for (const f of fixed) console.error(`  - ${f}`)
  console.error('\nThe path resolves now. Drop the row:')
  console.error('  node scripts/docs-path-audit.mjs --write')
}
console.error('')
process.exit(1)
