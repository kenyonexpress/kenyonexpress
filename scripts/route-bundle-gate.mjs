#!/usr/bin/env node
/**
 * Per-route first-load JS, read straight off the build. No server, no browser,
 * no database.
 *
 *   node scripts/route-bundle-gate.mjs            # ratchet from route-bundle-budgets.json
 *   node scripts/route-bundle-gate.mjs --print    # just the numbers
 *
 * WHY THIS EXISTS ALONGSIDE bundle-gate.mjs, WHICH IS NOT REDUNDANT WITH IT.
 * `bundle-gate.mjs` sums `rootMainFiles + polyfills` -- the floor every route
 * pays. That is all Turbopack gives it: Next 16 emits no app-build-manifest.json,
 * so per-route sums are not available from any manifest. The consequence, which
 * held until 2026-09-08: a heavy client import added to ONE route lands in that
 * route's own chunk, never in rootMainFiles, and the shared gate stays green
 * while the page it broke grows without limit. Measured that day, the shared
 * floor was 255.8 KB and `/` was 323.4 KB. The 68 KB in between was ungated.
 *
 * The prerendered HTML in .next/server/app/*.html names every chunk the route
 * loads on first paint, which is the thing the budget is about. Reading it needs
 * none of the machinery a browser run needs, and gzip of a fixed byte string is
 * identical on every machine, so this is a deterministic CI gate rather than a
 * timing measurement like Lighthouse.
 *
 * WHAT IT DOES NOT COUNT, deliberately:
 *   - chunks imported after hydration (~18 KB on `/`). They are real, they are
 *     not first load, and only a browser sees them: scripts/measure-route-js.mjs
 *     is the browser measurement and reports a DIFFERENT, smaller number,
 *     because a modern browser also skips the nomodule polyfill bundle that
 *     this gate counts. The two reconcile exactly and neither is wrong; they
 *     answer different questions.
 *   - third-party script tags. An app-code budget that silently absorbs a
 *     vendor's bytes stops being about this repository's code.
 */
import { existsSync, readFileSync } from 'node:fs'
import { gzipSync } from 'node:zlib'

export const BUDGETS_FILE = 'scripts/route-bundle-budgets.json'

/** Prerendered HTML for a route, or null when the route is not prerendered. */
export function htmlPathFor(route) {
  const name = route === '/' ? 'index' : route.replace(/^\//, '')
  return `.next/server/app/${name}.html`
}

/** Only this build's own static JS. Third-party <script src> is not app code. */
export function ownChunkUrls(html) {
  return [...new Set([...html.matchAll(/\/_next\/static\/[^"']+?\.js/g)].map((m) => m[0]))].sort()
}

export function gzipOf(chunkUrl) {
  const file = `.next${chunkUrl.replace('/_next', '')}`
  if (!existsSync(file)) return null
  return gzipSync(readFileSync(file)).byteLength
}

export function measureRoute(route) {
  const path = htmlPathFor(route)
  if (!existsSync(path)) return { route, bytes: null, chunks: 0, reason: 'not prerendered' }
  const urls = ownChunkUrls(readFileSync(path, 'utf8'))
  let bytes = 0
  for (const url of urls) {
    const size = gzipOf(url)
    // A chunk named by the HTML and absent from disk is a broken build, not a
    // zero. Reporting it as 0 would shrink the number and pass the gate.
    if (size === null)
      return { route, bytes: null, chunks: urls.length, reason: `chunk missing: ${url}` }
    bytes += size
  }
  return { route, bytes, chunks: urls.length, reason: null }
}

function main() {
  if (!existsSync('.next/server/app')) {
    console.error('route-bundle-gate: .next/server/app missing -- run pnpm build first')
    process.exit(2)
  }
  const budgets = JSON.parse(readFileSync(BUDGETS_FILE, 'utf8'))
  const printOnly = process.argv.includes('--print')
  let failed = 0

  for (const [route, budgetKb] of Object.entries(budgets.routes)) {
    const r = measureRoute(route)
    if (r.bytes === null) {
      console.log(`  ${route.padEnd(12)} UNMEASURED  ${r.reason}`)
      failed += 1
      continue
    }
    const kb = r.bytes / 1024
    const over = kb > budgetKb
    if (over && !printOnly) failed += 1
    console.log(
      `  ${route.padEnd(12)} ${kb.toFixed(1).padStart(7)} KB  ${String(r.chunks).padStart(3)} chunks  budget ${String(budgetKb).padStart(4)}  ${over ? 'OVER' : 'ok'}`,
    )
  }
  console.log(
    `\nspec target ${budgets.specTargetKb} KB -- see docs/PERF-REPORT.md on why the ratchet is not the target`,
  )
  process.exit(printOnly ? 0 : failed > 0 ? 1 : 0)
}

if (import.meta.url === `file://${process.argv[1]}`) main()
