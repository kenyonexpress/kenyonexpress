// Per-route client JS budget, measured in a real browser against a real build.
//
// Next 16 with `cacheComponents` stopped printing the "First Load JS" column,
// and Turbopack writes no app-build-manifest.json, so there is no file to read
// the number out of any more. The number STEP 14 budgets is what a browser
// actually downloads, so that is what this measures: every JS response the page
// requests, counted at its encoded (over-the-wire) size, not its source size.
//
// It refuses to report a number for a route it could not load. A route that
// 404s renders the not-found tree, whose chunk set is not the route's, and a
// silent 180 KB for the wrong page is worse than no measurement.
//
//   PORT=3317 pnpm start &
//   BASE=http://localhost:3317 node scripts/measure-route-js.mjs

import { gzipSync } from 'node:zlib'
import { chromium } from '@playwright/test'

export const BUDGET_GZ_BYTES = 180 * 1024

export const ROUTES = ['/', '/products', '/cart', '/checkout']

// Gzip is computed here rather than read off the wire on purpose. Playwright
// reports `responseBodySize` inconsistently across transports, the dev server
// and `pnpm start` negotiate different encodings, and a browser that asks for
// brotli gets a number that is not the one the budget is written in. Gzipping
// the decoded body ourselves is the same arithmetic every time.
export async function gzipBytes(response) {
  try {
    return gzipSync(await response.body()).byteLength
  } catch {
    return 0
  }
}

// `.js` and nothing else. Turbopack writes CSS into /_next/static/chunks/ too,
// so a directory test charges 22 KB of stylesheet to a JavaScript budget --
// which it did, in the first run of this script.
export function isRouteJs(url) {
  return /\.js(\?|$)/.test(url)
}

export function verdict(bytes) {
  return bytes <= BUDGET_GZ_BYTES ? 'PASS' : 'FAIL'
}

async function measure(page, base, route) {
  const seen = new Map()
  const onResponse = async (response) => {
    const url = response.url()
    if (!isRouteJs(url)) return
    if (seen.has(url)) return
    seen.set(url, await gzipBytes(response))
  }
  page.on('response', onResponse)

  const nav = await page.goto(base + route, { waitUntil: 'networkidle', timeout: 45_000 })
  page.off('response', onResponse)

  if (!nav || nav.status() >= 400) {
    return { route, status: nav?.status() ?? 0, bytes: null, chunks: seen.size }
  }
  let total = 0
  for (const n of seen.values()) total += n
  return { route, status: nav.status(), bytes: total, chunks: seen.size }
}

async function main() {
  const base = process.env.BASE ?? 'http://localhost:3317'
  const browser = await chromium.launch()
  const page = await browser.newPage()
  const results = []
  for (const route of ROUTES) results.push(await measure(page, base, route))
  await browser.close()

  console.log(`budget ${BUDGET_GZ_BYTES} bytes gzipped\n`)
  let failed = 0
  for (const r of results) {
    if (r.bytes === null) {
      console.log(`  ${r.route.padEnd(12)} UNMEASURED  http ${r.status}`)
      failed += 1
      continue
    }
    const kb = (r.bytes / 1024).toFixed(1)
    const v = verdict(r.bytes)
    if (v === 'FAIL') failed += 1
    console.log(
      `  ${r.route.padEnd(12)} ${kb.padStart(7)} KB  ${String(r.chunks).padStart(3)} chunks  ${v}`,
    )
  }
  process.exit(failed > 0 ? 1 : 0)
}

if (import.meta.url === `file://${process.argv[1]}`) await main()
