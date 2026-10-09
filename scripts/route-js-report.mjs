#!/usr/bin/env node
/**
 * Per-route client JS, gzipped, from the LAST `pnpm build`.
 *
 *   node scripts/route-js-report.mjs            # every app route
 *   node scripts/route-js-report.mjs /(store)   # routes whose key starts with this
 *   node scripts/route-js-report.mjs --json     # machine-readable
 *
 * `scripts/bundle-gate.mjs` measures the shared first-load JS (rootMainFiles)
 * and says, correctly, that Turbopack emits no app-build-manifest.json, so
 * per-route sums are "not available" from that file. They are available from
 * a different one: every app route gets a
 * `.next/server/app/<route>/page_client-reference-manifest.js` whose
 * `clientModules[*].chunks` lists the client chunks the route's tree can load.
 * The union of those chunks plus the root files is what a first visit to the
 * route downloads before it is interactive, which is the number a
 * code-splitting change is supposed to move.
 *
 * Two things this does NOT count, on purpose:
 *  - `async: true` modules, i.e. `next/dynamic` and `import()` boundaries.
 *    Those are the chunks a split moved OUT of the critical path, and counting
 *    them would make every split invisible. They are reported separately as
 *    "deferred" so a split shows up as bytes moving from one column to the
 *    other, not disappearing.
 *  - CSS. Same manifest, different budget.
 *
 * Does not build. Run `pnpm build` first, as bundle-gate does.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import { gzipSync } from 'node:zlib'

const args = process.argv.slice(2)
const asJson = args.includes('--json')
const prefix = args.find((a) => !a.startsWith('--')) ?? ''

const SERVER_APP = '.next/server/app'
let buildManifest
try {
  buildManifest = JSON.parse(readFileSync('.next/build-manifest.json', 'utf8'))
} catch {
  console.error('route-js-report: .next/build-manifest.json missing -- run pnpm build first')
  process.exit(2)
}

const gzCache = new Map()
function gzipKb(chunkPath) {
  const rel = chunkPath.replace(/^\/_next\//, '')
  if (gzCache.has(rel)) return gzCache.get(rel)
  let kb = 0
  try {
    kb = gzipSync(readFileSync(join('.next', rel))).length / 1024
  } catch {
    kb = 0
  }
  gzCache.set(rel, kb)
  return kb
}

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name)
    if (entry.isDirectory()) walk(p, out)
    else if (entry.name === 'page_client-reference-manifest.js') out.push(p)
  }
  return out
}

/**
 * The manifest is a script that assigns into `globalThis.__RSC_MANIFEST`.
 * Evaluated in a sandboxed function with a throwaway global rather than parsed
 * with a regex: the JSON literal contains the same quote characters as any
 * other file path in this repo.
 */
function readManifest(file) {
  const src = readFileSync(file, 'utf8')
  const sandbox = { __RSC_MANIFEST: {} }
  new Function('globalThis', src)(sandbox)
  const [key, value] = Object.entries(sandbox.__RSC_MANIFEST)[0] ?? []
  return key ? { key, value } : null
}

const rootFiles = [
  ...new Set([...(buildManifest.rootMainFiles ?? []), ...(buildManifest.polyfillFiles ?? [])]),
].filter((f) => f.endsWith('.js'))
const rootKb = rootFiles.reduce((sum, f) => sum + gzipKb(f), 0)

const rows = []
for (const file of walk(SERVER_APP)) {
  const manifest = readManifest(file)
  if (!manifest) continue
  if (prefix && !manifest.key.startsWith(prefix)) continue
  const critical = new Set()
  const deferred = new Set()
  for (const mod of Object.values(manifest.value.clientModules ?? {})) {
    for (const chunk of mod.chunks ?? []) {
      if (!chunk.endsWith('.js')) continue
      const rel = chunk.replace(/^\/_next\//, '')
      if (rootFiles.includes(rel)) continue
      if (mod.async) deferred.add(chunk)
      else critical.add(chunk)
    }
  }
  for (const chunk of critical) deferred.delete(chunk)
  const criticalKb = [...critical].reduce((sum, c) => sum + gzipKb(c), 0)
  const deferredKb = [...deferred].reduce((sum, c) => sum + gzipKb(c), 0)
  rows.push({
    route: manifest.key,
    file: relative(process.cwd(), file),
    rootKb,
    routeKb: criticalKb,
    firstLoadKb: rootKb + criticalKb,
    deferredKb,
    chunks: critical.size,
    deferredChunks: deferred.size,
  })
}

rows.sort((a, b) => b.firstLoadKb - a.firstLoadKb)

if (asJson) {
  console.log(JSON.stringify({ rootKb: Number(rootKb.toFixed(1)), routes: rows }, null, 2))
} else {
  console.log(`shared root JS: ${rootKb.toFixed(1)} KB gz across ${rootFiles.length} files\n`)
  console.log('first-load  route-only  deferred  chunks  route')
  for (const r of rows) {
    console.log(
      `${r.firstLoadKb.toFixed(1).padStart(9)}  ${r.routeKb.toFixed(1).padStart(10)}  ${r.deferredKb.toFixed(1).padStart(8)}  ${String(r.chunks).padStart(6)}  ${r.route}`,
    )
  }
}
