#!/usr/bin/env node
/**
 * Per-route client JS, gzipped, from the LAST `pnpm build`.
 *
 *   node scripts/route-js-report.mjs            # every app route
 *   node scripts/route-js-report.mjs /(store)   # routes whose key starts with this
 *   node scripts/route-js-report.mjs --json     # machine-readable
 *   node scripts/route-js-report.mjs --gate     # exit 1 when a budget below is exceeded
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
 * Three things this does NOT count, on purpose:
 *  - `async: true` modules, i.e. `next/dynamic` and `import()` boundaries.
 *    Those are the chunks a split moved OUT of the critical path, and counting
 *    them would make every split invisible. They are reported separately as
 *    "deferred" so a split shows up as bytes moving from one column to the
 *    other, not disappearing.
 *  - `polyfillFiles`. Next emits them with `noModule`, and a browser that
 *    understands ES modules never requests them (measured 2026-10-07 with
 *    scripts/route-js-browser.mjs: 27 scripts fetched on `/`, the polyfill not
 *    among them). bundle-gate.mjs still counts them, which is why its "shared
 *    root" is ~39 KB larger than the one here. Reported on its own line.
 *  - CSS. Same manifest, different budget.
 *
 * Does not build. Run `pnpm build` first, as bundle-gate does.
 *
 * BUDGETS. `--gate` compares each route's first-load (root + route-only) to
 * the table below and exits 1 on the first breach. The numbers are a ratchet:
 * each is the value measured on the build that set it plus a little headroom,
 * so a change that adds a package to a storefront first load fails CI here,
 * not in a Lighthouse median three jobs later. Lower a budget when a step
 * earns it; raise one only with the measurement that justifies it in the
 * commit message.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import { gzipSync } from 'node:zlib'

/** First-load budgets, KB gzipped, keyed by manifest route key. */
export const FIRST_LOAD_BUDGETS_KB = {
  // Measured 2026-10-07 after STEP 34: 189.9 / 198.5 / 191.8 / 190.4 / 197.2.
  '/(store)/page': 195,
  '/(store)/product/[slug]/page': 205,
  '/(store)/category/[slug]/page': 200,
  '/(store)/cart/page': 200,
  '/(store)/checkout/page': 205,
}
/** Any other storefront route: the busiest route's budget. */
export const STORE_DEFAULT_BUDGET_KB = 205
/** The shared root files alone (React, the router, the runtime): 132.0 measured. */
export const ROOT_BUDGET_KB = 140

const args = process.argv.slice(2)
const asJson = args.includes('--json')
const asGate = args.includes('--gate')
const prefix = args.find((a) => !a.startsWith('--')) ?? (asGate ? '/(store)' : '')

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

const polyfillFiles = (buildManifest.polyfillFiles ?? []).filter((f) => f.endsWith('.js'))
const rootFiles = [...new Set(buildManifest.rootMainFiles ?? [])].filter(
  (f) => f.endsWith('.js') && !polyfillFiles.includes(f),
)
const rootKb = rootFiles.reduce((sum, f) => sum + gzipKb(f), 0)
const polyfillKb = polyfillFiles.reduce((sum, f) => sum + gzipKb(f), 0)

export function budgetFor(route) {
  if (route in FIRST_LOAD_BUDGETS_KB) return FIRST_LOAD_BUDGETS_KB[route]
  if (route.startsWith('/(store)/')) return STORE_DEFAULT_BUDGET_KB
  return null
}

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
      if (rootFiles.includes(rel) || polyfillFiles.includes(rel)) continue
      if (mod.async) deferred.add(chunk)
      else critical.add(chunk)
    }
  }
  for (const chunk of critical) deferred.delete(chunk)
  const criticalKb = [...critical].reduce((sum, c) => sum + gzipKb(c), 0)
  const deferredKb = [...deferred].reduce((sum, c) => sum + gzipKb(c), 0)
  const budgetKb = budgetFor(manifest.key)
  rows.push({
    route: manifest.key,
    file: relative(process.cwd(), file),
    rootKb,
    routeKb: criticalKb,
    firstLoadKb: rootKb + criticalKb,
    deferredKb,
    chunks: critical.size,
    deferredChunks: deferred.size,
    budgetKb,
    over: budgetKb !== null && rootKb + criticalKb > budgetKb,
  })
}
rows.sort((a, b) => b.firstLoadKb - a.firstLoadKb)

if (asJson) {
  console.log(
    JSON.stringify(
      {
        rootKb: Number(rootKb.toFixed(1)),
        polyfillKb: Number(polyfillKb.toFixed(1)),
        rootBudgetKb: ROOT_BUDGET_KB,
        routes: rows,
      },
      null,
      2,
    ),
  )
} else {
  console.log(
    `shared root JS: ${rootKb.toFixed(1)} KB gz across ${rootFiles.length} files (budget ${ROOT_BUDGET_KB})`,
  )
  console.log(
    `nomodule polyfills, not fetched by module-capable browsers: ${polyfillKb.toFixed(1)} KB gz across ${polyfillFiles.length} file(s)\n`,
  )
  console.log('first-load  route-only  deferred  chunks  budget  route')
  for (const r of rows) {
    const budget = r.budgetKb === null ? '     -' : String(r.budgetKb).padStart(6)
    const flag = r.over ? '  OVER' : ''
    console.log(
      `${r.firstLoadKb.toFixed(1).padStart(9)}  ${r.routeKb.toFixed(1).padStart(10)}  ${r.deferredKb.toFixed(1).padStart(8)}  ${String(r.chunks).padStart(6)}  ${budget}  ${r.route}${flag}`,
    )
  }
}

if (asGate) {
  const breaches = rows.filter((r) => r.over)
  const rootOver = rootKb > ROOT_BUDGET_KB
  if (rootOver) {
    console.error(
      `\nroute-js-report: shared root ${rootKb.toFixed(1)} KB gz exceeds its ${ROOT_BUDGET_KB} KB budget`,
    )
  }
  for (const r of breaches) {
    console.error(
      `route-js-report: ${r.route} first-load ${r.firstLoadKb.toFixed(1)} KB gz exceeds its ${r.budgetKb} KB budget`,
    )
  }
  if (rows.length === 0) {
    console.error(`route-js-report: no routes matched "${prefix}" -- unexpected build layout`)
    process.exit(2)
  }
  if (rootOver || breaches.length > 0) process.exit(1)
  console.log(`\nroute-js-report: ${rows.length} routes within budget -- ok`)
}
