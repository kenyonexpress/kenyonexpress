import { expect, test } from '@playwright/test'

/**
 * CLS on the search page, as a gate.
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

const QUERIES = [
  { label: 'no results, the collapse case', q: 'barbecue' },
  { label: 'sixteen results, the growth case', q: 'מוצר' },
]

for (const { label, q } of QUERIES) {
  test(`search stays under the CLS budget: ${label}`, async ({ page }) => {
    // Buffered, and installed before the navigation: the shift happens when the
    // streamed boundary resolves, which is well before anything this test could
    // await afterwards.
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

    await page.goto(`/search?q=${encodeURIComponent(q)}`, { waitUntil: 'networkidle' })
    // The boundary resolves around 350-950ms on this build. Two seconds is past
    // the slowest of those with room for a machine under load, and a shift that
    // arrives later than this would be a different bug.
    await page.waitForTimeout(2000)

    const cls = await page.evaluate(() => (window as unknown as { __cls: number }).__cls)
    expect(cls, `search?q=${q} shifted ${cls.toFixed(4)}`).toBeLessThan(CLS_GOOD)
  })
}
