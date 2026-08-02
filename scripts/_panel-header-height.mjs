/**
 * Heights of the admin and supplier panel headers, for the Suspense fallbacks
 * that stand in for them while the session read streams.
 *
 * Both headers are Tailwind utilities only, and those live in the global
 * stylesheet that every route loads, so the markup can be measured against any
 * running page rather than needing a panel session to reach the real one.
 *
 *   pnpm start & node scripts/_panel-header-height.mjs
 */
import { chromium } from '@playwright/test'

const BASE = process.env.LOCAL_BASE ?? 'http://localhost:3311'

const ADMIN = `
<div dir="rtl" data-admin class="min-h-screen bg-white font-sans text-heading" id="probe">
  <header class="sticky top-0 z-20 border-b border-gray-200 bg-white px-6 py-3">
    <div class="mx-auto flex max-w-7xl items-center justify-between">
      <a class="text-lg font-bold text-heading">KenyonExpress <span class="text-sm font-normal text-black/50">/ ניהול</span></a>
      <div class="flex items-center gap-4">
        <span class="text-sm text-black/60">מנהל</span>
        <form><button type="submit" class="inline-flex items-center gap-1.5 text-sm text-black/60"><svg width="15" height="15"></svg>יציאה</button></form>
      </div>
    </div>
  </header>
</div>`

const SUPPLIER = `
<div dir="rtl" class="min-h-screen bg-gray-50 font-sans text-gray-900" id="probe">
  <header class="sticky top-0 z-20 border-b border-gray-200 bg-white px-4 py-3">
    <div class="mx-auto flex max-w-2xl items-center justify-between">
      <div class="flex items-center gap-2"><svg width="18" height="18"></svg><span class="text-base font-bold">אזור ספקים</span></div>
      <form><button type="submit" class="inline-flex items-center gap-1.5 text-sm text-gray-500"><svg width="15" height="15"></svg>יציאה</button></form>
    </div>
  </header>
</div>`

const browser = await chromium.launch()
for (const [name, markup] of [
  ['admin', ADMIN],
  ['supplier', SUPPLIER],
]) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  await page.goto(BASE, { waitUntil: 'networkidle' })
  await page.evaluate((html) => {
    document.body.insertAdjacentHTML('beforeend', html)
  }, markup)
  const h = await page.locator('#probe header').evaluate((el) => el.getBoundingClientRect().height)
  console.log(`${name.padEnd(9)} header -> ${h}px`)
  await page.close()
}
await browser.close()
