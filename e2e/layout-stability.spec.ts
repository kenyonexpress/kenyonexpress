import { expect, test } from '@playwright/test'
import { firstProductHref } from './helpers'

/**
 * CLS as a gate, on the search page and on every other public route.
 *
 * THE SCOPE WAS THE BUG, AGAIN. This file held the search page alone, and the
 * search page kept passing. The stage-8 Lighthouse sweep on 2026-08-19 measured
 * `/coupons` at CLS 0.585 -- six times the "poor" threshold, and the worst
 * number in the whole audit -- because it streamed its grid under
 * `<Suspense fallback={null}>` and threw its own footer about a thousand pixels
 * down on resolve. It was outside this gate, exactly as the product page was
 * outside the 320px RTL gate and ten routes were outside the a11y gate, all
 * found the same day.
 *
 * The sweep below is therefore every public route, at the phone viewport the
 * project already runs. The budget is loose enough that only a real regression
 * trips it: measured on the build that added it, every route was between 0.000
 * and 0.027.
 *
 * The search page is the one page whose height is decided by an answer it does
 * not have when it starts painting. `.category-page__body` is `display: block`,
 * so the filter sidebar and the footer sit BELOW the grid, and every row the
 * placeholder reserves and the results do not fill drags both of them upward on
 * resolve. A shift of something that becomes visible is exactly what CLS counts.
 *
 * Three fixes brought this page from 0.263 desktop / 0.282 phone to under 0.04
 * on both: the placeholder holds two rows, `.category-page__main--search` keeps
 * that height so short result sets cannot collapse it, and the phone reserves
 * two heading lines because the H1 is the query and wraps there. All three are
 * commented where they live, with the measurements.
 *
 * The queries are the two ends of the range this catalogue can produce and they
 * are pinned on purpose: `barbecue` returns NOTHING, which is the collapse this
 * gate exists for, and `מוצר` returns sixteen, which is the growth case. A gate
 * on one of them would pass while the other regressed.
 *
 * 0.1 is the Core Web Vitals "good" boundary, not a number chosen here. The
 * margin is wide: the regression this replaced measured 0.26 to 0.28, so a gate
 * that has to survive a loaded machine still catches it by a factor of three.
 */
const CLS_GOOD = 0.1

/**
 * Reads the accumulated layout shift for a route.
 *
 * Buffered and installed before the navigation: the shift happens when the
 * streamed boundary resolves, which is well before anything a test could await
 * afterwards.
 */
async function measureCls(page: import('@playwright/test').Page, path: string): Promise<number> {
  await page.addInitScript(() => {
    ;(window as unknown as { __cls: number }).__cls = 0
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as (PerformanceEntry & {
        value: number
        hadRecentInput: boolean
      })[]) {
        if (entry.hadRecentInput) continue
        ;(window as unknown as { __cls: number }).__cls += entry.value
      }
    }).observe({ type: 'layout-shift', buffered: true })
  })

  await page.goto(path, { waitUntil: 'networkidle' })
  // The boundaries on this build resolve around 350-950ms. Two seconds is past
  // the slowest of those with room for a machine under load, and a shift that
  // arrives later than this would be a different bug.
  await page.waitForTimeout(2000)
  return page.evaluate(() => (window as unknown as { __cls: number }).__cls)
}

const QUERIES = [
  { label: 'no results, the collapse case', q: 'barbecue' },
  { label: 'sixteen results, the growth case', q: 'מוצר' },
]

for (const { label, q } of QUERIES) {
  test(`search stays under the CLS budget: ${label}`, async ({ page }) => {
    const cls = await measureCls(page, `/search?q=${encodeURIComponent(q)}`)
    expect(cls, `search?q=${q} shifted ${cls.toFixed(4)}`).toBeLessThan(CLS_GOOD)
  })
}

/**
 * EVERY OTHER PUBLIC ROUTE.
 *
 * `/coupons` is first in the list and it is the reason the list exists. The
 * routes that stream a catalogue read under a Suspense boundary are the ones
 * that can regress this way, but a route with no boundary today can grow one in
 * any commit, which is the argument for sweeping all of them rather than the
 * three that look risky.
 *
 * `/checkout` is here even though an empty cart bounces it to `/cart`: the
 * bounce is what a visitor with an empty cart actually sees, and if it ever
 * starts shifting, that is worth knowing.
 */
const ROUTES = [
  '/coupons',
  '/',
  '/products',
  '/category/hot-deals',
  '/cart',
  '/checkout',
  '/suppliers',
  '/supplier/login',
  '/login',
  '/signup',
  '/contact',
  '/legal/terms',
  '/legal/privacy',
  '/legal/returns',
  '/legal/accessibility',
]

for (const path of ROUTES) {
  test(`${path} stays under the CLS budget`, async ({ page }) => {
    const cls = await measureCls(page, path)
    expect(cls, `${path} shifted ${cls.toFixed(4)}`).toBeLessThan(CLS_GOOD)
  })
}

test('a product page stays under the CLS budget', async ({ page }) => {
  // Through a catalogue link rather than a hardcoded slug: a stale slug 404s,
  // and a 404 page does not shift.
  await page.goto('/products')
  const href = await firstProductHref(page)
  const cls = await measureCls(page, href)
  expect(cls, `${href} shifted ${cls.toFixed(4)}`).toBeLessThan(CLS_GOOD)
})
