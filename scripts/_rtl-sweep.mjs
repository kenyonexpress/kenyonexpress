#!/usr/bin/env node
/**
 * MISSION-FINAL stage 8: RTL audit on EVERY public route, not a sample.
 *
 * The 320px gate in e2e/rtl-mobile.spec.ts held seven routes. The a11y sweep of
 * the same day proved that a gate's scope is itself a bug surface: ten of the
 * thirteen routes that were missing from the a11y gate failed. This probe runs
 * the same two RTL checks over the full public route list before deciding what
 * the gate should hold.
 *
 * Checks per route, per width:
 *   1. <html lang="he" dir="rtl"> — the shell that makes every logical property flip.
 *   2. document.scrollWidth <= viewport + 1 — sideways scroll is what a person feels.
 *      When it overflows, name the elements that stick out, so the fix has a target.
 *
 * Usage: BASE=http://localhost:3455 node scripts/_rtl-sweep.mjs
 */
import { chromium } from '@playwright/test'

const BASE = process.env.BASE ?? 'http://localhost:3455'
const WIDTHS = [320, 393]

const ROUTES = [
  '/',
  '/products',
  '/cart',
  '/checkout',
  '/contact',
  '/offline',
  '/supplier/login',
  '/coupons',
  '/coupons/0831924f-3092-4004-afb6-827cc8950bb8',
  '/suppliers',
  '/login',
  '/signup',
  '/forgot-password',
  '/reset-password',
  '/search?q=%D7%9E%D7%95%D7%A6%D7%A8',
  '/category/hot-deals',
  '/category/baby-kids',
  '/category/phones-computers',
  '/product/airpods-pro-2',
  '/product/demo-coupon-1',
  '/legal/terms',
  '/legal/privacy',
  '/legal/returns',
  '/legal/accessibility',
  '/terms-and-conditions',
  '/privacy-policy',
  '/this-route-does-not-exist',
]

const browser = await chromium.launch()
const rows = []

for (const width of WIDTHS) {
  const context = await browser.newContext({
    viewport: { width, height: 800 },
    deviceScaleFactor: 1,
  })
  for (const route of ROUTES) {
    const page = await context.newPage()
    let status = 0
    try {
      const res = await page.goto(BASE + route, { waitUntil: 'domcontentloaded', timeout: 30000 })
      status = res?.status() ?? 0
      // Below-the-fold images decide height, not width; a short settle is enough.
      await page.waitForTimeout(700)
      const result = await page.evaluate((vw) => {
        const html = document.documentElement
        const scrollWidth = html.scrollWidth
        const offenders = []
        if (scrollWidth > vw + 1) {
          for (const el of document.querySelectorAll('body *')) {
            const r = el.getBoundingClientRect()
            if (r.width === 0 || r.height === 0) continue
            const overflowsEnd = r.right > vw + 1
            const overflowsStart = r.left < -1
            if (!overflowsEnd && !overflowsStart) continue
            const cs = getComputedStyle(el)
            if (cs.position === 'fixed' && cs.visibility === 'hidden') continue
            offenders.push({
              tag: el.tagName.toLowerCase(),
              cls: (typeof el.className === 'string' ? el.className : '').slice(0, 90),
              left: Math.round(r.left),
              right: Math.round(r.right),
              w: Math.round(r.width),
            })
          }
        }
        return {
          lang: html.getAttribute('lang'),
          dir: html.getAttribute('dir'),
          scrollWidth,
          // The deepest offenders are the cause; the ancestors just inherit it.
          offenders: offenders.slice(-8),
        }
      }, width)
      rows.push({ width, route, status, ...result })
    } catch (err) {
      rows.push({ width, route, status, error: String(err).split('\n')[0] })
    }
    await page.close()
  }
  await context.close()
}
await browser.close()

let bad = 0
for (const r of rows) {
  const shellOk = r.lang === 'he' && r.dir === 'rtl'
  const fitOk = r.scrollWidth != null && r.scrollWidth <= r.width + 1
  if (r.error) {
    bad++
    console.log(`ERR  ${r.width} ${r.route} :: ${r.error}`)
    continue
  }
  if (shellOk && fitOk) continue
  bad++
  console.log(
    `FAIL ${r.width} ${r.route} (${r.status}) lang=${r.lang} dir=${r.dir} scrollWidth=${r.scrollWidth}`,
  )
  for (const o of r.offenders ?? []) {
    console.log(`       <${o.tag} class="${o.cls}"> left=${o.left} right=${o.right} w=${o.w}`)
  }
}
console.log(`\n${rows.length - bad}/${rows.length} route-widths clean.`)
