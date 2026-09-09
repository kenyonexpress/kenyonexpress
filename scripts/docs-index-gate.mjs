#!/usr/bin/env node
/**
 * `docs/INDEX.md` MUST LIST EVERY DOCUMENT, AND LIST NOTHING THAT IS GONE.
 *
 * The index is the only file anyone reads before deciding what else to read, so
 * a document missing from it is, in practice, a document that does not exist.
 * The edition this replaced listed 170 of 255 - the other 85 had been written,
 * committed and forgotten, and nothing anywhere said so. An index drifts
 * silently by construction: adding a document is one commit and updating the
 * index is a second one that no test ever asked for.
 *
 * Two directions, both of which have to fail:
 *
 *   1. a file in `docs/` with no row in the index      (written, then lost)
 *   2. a row in the index whose file is gone           (a link to nothing)
 *
 * Rows may point outside `docs/` with `../`, which is how the two documents at
 * the repository root are reachable; those are resolved and checked too, but
 * they are not required to exist in `docs/`.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DOCS = join(ROOT, 'docs')
const INDEX = join(DOCS, 'INDEX.md')

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (entry.endsWith('.md')) out.push(p.slice(DOCS.length + 1))
  }
  return out
}

const onDisk = walk(DOCS)
  .filter((f) => f !== 'INDEX.md')
  .sort()

const index = readFileSync(INDEX, 'utf8')
/** Only table rows, so prose that happens to link a document is not a listing. */
const linked = [...index.matchAll(/^\|\s*\[[^\]]+\]\(([^)]+\.md)\)\s*\|/gm)].map((m) => m[1])

const listed = new Set(linked.filter((l) => !l.startsWith('../')))
const external = linked.filter((l) => l.startsWith('../'))

const missing = onDisk.filter((f) => !listed.has(f))
const stale = [...listed].filter((f) => !existsSync(join(DOCS, f))).sort()
const staleExternal = external.filter((f) => !existsSync(resolve(DOCS, f)))

const problems = []
if (missing.length)
  problems.push([`${missing.length} document(s) in docs/ with no row in INDEX.md`, missing])
if (stale.length)
  problems.push([`${stale.length} row(s) in INDEX.md pointing at a file that is gone`, stale])
if (staleExternal.length)
  problems.push([`${staleExternal.length} out-of-docs row(s) pointing at nothing`, staleExternal])

if (problems.length === 0) {
  console.log(
    `docs-index-gate: OK. ${onDisk.length} documents, all listed; ${external.length} out-of-docs row(s) resolve.`,
  )
  process.exit(0)
}

for (const [headline, items] of problems) {
  console.error(`\ndocs-index-gate: ${headline}:\n`)
  for (const i of items) console.error(`  ${i}`)
}
console.error('')
process.exit(1)
