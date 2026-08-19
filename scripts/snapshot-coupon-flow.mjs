// snapshot-coupon-flow.mjs
//
// Captures the customer-facing coupon surfaces from a LOCAL built server into
// refs/coupon-flow/, as evidence for the COUPON STOREFRONT wave step 20.
//
// WHAT IT CAN AND CANNOT SHOW. Only the anonymous surfaces. The purchase leg
// and the supplier scan both need a session and a service-role key, and the
// only Supabase project configured here is production while the local
// SUPABASE_SECRET_KEY is the generic `iss=supabase-demo` key. Seeding the
// fixtures the paid e2e wants would write test rows into the live database, so
// this script deliberately stops at the pages anon can already reach.
//
// That still makes it a real check rather than a screenshot for its own sake:
// these pages render through the same TO public RLS policies that migrations
// 120 and 121 rewrote, so a blank or 500 page here would be the regression
// those migrations could have caused.
//
// Prerequisites: a built server, not a dev server.
//   pnpm build && PORT=3311 pnpm start &
//   LOCAL_BASE=http://localhost:3311 node scripts/snapshot-coupon-flow.mjs
//
// Chromium comes from @playwright/test, which is already a devDependency;
// `playwright` itself cannot be installed in this repo (see AGENTS.md).

import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { chromium } from '@playwright/test'

const BASE = process.env.LOCAL_BASE || 'http://localhost:3311'
const SLUG = process.env.COUPON_SLUG || 'demo-coupon-12'
const OUT = path.resolve('refs/coupon-flow')

const WIDTHS = [380, 768, 1440]

const PAGES = [
  { name: 'coupon-pdp', url: `/product/${SLUG}`, needsAuth: false },
  { name: 'coupons-list', url: '/coupons', needsAuth: false },
]

/**
 * The consent banner is hidden before the shot, and that is not cosmetic: it is
 * fixed-position, and on a narrow viewport it sits directly over the coupon's
 * "paid on site" line, which is the one number these screenshots exist to show.
 *
 * Hidden with CSS rather than clicked away. Clicking raced the hydration and
 * silently left the banner up on the PDP while working on the list page, and it
 * would also have written a consent choice into storage just to take a picture.
 * The element exposes data-consent-banner, so the hook is explicit.
 */
async function hideConsent(page) {
  await page
    .addStyleTag({ content: '[data-consent-banner]{display:none !important}' })
    .catch(() => {})
}

async function shoot(page, url, file) {
  const res = await page.goto(`${BASE}${url}`, { waitUntil: 'networkidle', timeout: 45_000 })
  const status = res?.status() ?? 0
  await page.evaluate(() => document.fonts.ready)
  await hideConsent(page)
  const html = await page.content()
  await page.screenshot({ path: file, fullPage: true })
  return { status, bytes: html.length }
}

const browser = await chromium.launch()
await mkdir(OUT, { recursive: true })

let failed = false
for (const spec of PAGES) {
  for (const width of WIDTHS) {
    const ctx = await browser.newContext({
      viewport: { width, height: 900 },
      locale: 'he-IL',
      timezoneId: 'Asia/Jerusalem',
      deviceScaleFactor: 1,
    })
    const page = await ctx.newPage()
    const file = path.join(OUT, `${spec.name}-${width}.png`)
    try {
      const { status, bytes } = await shoot(page, spec.url, file)
      // A 200 that rendered almost nothing is the failure mode worth catching:
      // it is what a broken RLS policy looks like from the outside.
      const thin = bytes < 20_000
      if (status !== 200 || thin) failed = true
      console.log(
        `${status === 200 && !thin ? 'ok  ' : 'FAIL'} ${spec.name}@${width} status=${status} dom=${bytes}B -> ${path.relative(process.cwd(), file)}`,
      )
    } catch (error) {
      failed = true
      console.log(`FAIL ${spec.name}@${width} ${error.message}`)
    }
    await ctx.close()
  }
}

await browser.close()

if (failed) {
  console.error('\ncoupon-flow snapshot: at least one page did not render')
  process.exit(1)
}
console.log('\ncoupon-flow snapshot: all pages rendered')
