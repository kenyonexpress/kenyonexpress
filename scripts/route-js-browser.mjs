#!/usr/bin/env node
/**
 * What a real browser actually downloads for a route: every script response,
 * raw and on the wire, from a headless Chromium against a running server.
 *
 *   PORT=3311 pnpm start &
 *   node scripts/route-js-browser.mjs                       # default routes below
 *   node scripts/route-js-browser.mjs --base=http://localhost:3311 --routes=/,/cart
 *   node scripts/route-js-browser.mjs --verbose             # one line per chunk
 *
 * `route-js-report.mjs` reads the manifests and is the number CI gates on.
 * This script is the check on that number: it fetches the page the way a
 * visitor does, with consent granted so the analytics islands mount, and
 * reports what the network saw. The two differ by design in two places, both
 * worth knowing when the numbers are compared:
 *  - this one includes chunks PREFETCHED for links on the page (a category
 *    page's filter island shows up on `/` because the home page links to
 *    categories), and the manifest does not;
 *  - this one never sees the `noModule` polyfill, and bundle-gate.mjs counts it.
 *
 * Needs `@playwright/test` (a devDependency) and its Chromium. Does not start
 * a server: start `pnpm start` first on the port you pass, and check the
 * listener is yours (`/usr/sbin/lsof -nP -iTCP:<port> -sTCP:LISTEN`).
 */
import { chromium } from '@playwright/test'

const args = process.argv.slice(2)
const flag = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`))
  return hit ? hit.slice(name.length + 3) : fallback
}
const base = flag('base', process.env.BASE ?? 'http://localhost:3311').replace(/\/+$/, '')
const routes = flag('routes', '/,/product/barbecue,/category/electronics,/cart,/checkout').split(
  ',',
)
const verbose = args.includes('--verbose')
const asJson = args.includes('--json')

const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
// Granted, so the consent-gated islands (tracker, PostHog, tags) load and are
// counted; a measurement with them unmounted flatters every number.
await context.addCookies([{ name: 'ke_consent', value: 'granted.2', url: base }])

const results = []
for (const route of routes) {
  const page = await context.newPage()
  const scripts = []
  page.on('response', async (response) => {
    const url = response.url()
    const isScript =
      response.request().resourceType() === 'script' || url.includes('/_next/static/chunks/')
    if (!isScript || url.endsWith('.css')) return
    try {
      const body = await response.body()
      const sizes = await response
        .request()
        .sizes()
        .catch(() => null)
      scripts.push({
        url: url.replace(base, ''),
        raw: body.length,
        wire: sizes?.responseBodySize ?? -1,
        encoding: response.headers()['content-encoding'] ?? 'identity',
      })
    } catch {
      // A response whose body is gone by the time we ask (navigated away).
    }
  })
  const response = await page.goto(`${base}${route}`, { waitUntil: 'load' })
  // Idle-time loaders (the Sentry SDK, prefetches) fire after `load`; wait
  // long enough to see them so the "deferred" column is real.
  await page.waitForTimeout(4_000)
  const rawKb = scripts.reduce((sum, s) => sum + s.raw, 0) / 1024
  const wireKb = scripts.reduce((sum, s) => sum + Math.max(0, s.wire), 0) / 1024
  results.push({
    route,
    status: response?.status() ?? 0,
    scripts: scripts.length,
    rawKb: Number(rawKb.toFixed(1)),
    wireKb: Number(wireKb.toFixed(1)),
    chunks: scripts.sort((a, b) => b.raw - a.raw),
  })
  await page.close()
}
await browser.close()

if (asJson) {
  console.log(JSON.stringify(results, null, 2))
} else {
  console.log(`base ${base}\n`)
  console.log('   status  scripts    raw KB   wire KB  route')
  for (const r of results) {
    console.log(
      `   ${String(r.status).padStart(6)}  ${String(r.scripts).padStart(7)}  ${r.rawKb.toFixed(1).padStart(8)}  ${r.wireKb.toFixed(1).padStart(8)}  ${r.route}`,
    )
    if (verbose) {
      for (const s of r.chunks) {
        console.log(
          `           ${String(s.raw).padStart(8)}  ${String(s.wire).padStart(8)}  ${s.encoding.padEnd(8)}  ${s.url.split('/').pop()}`,
        )
      }
    }
  }
}
