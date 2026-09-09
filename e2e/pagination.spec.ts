import { expect, test } from '@playwright/test'

/**
 * Pagination, asserted as a PROPERTY rather than as a page size.
 *
 * =========================================================================
 * THE SECTION SAYS 50 PER PAGE. NOTHING HERE IS 50.
 * =========================================================================
 *
 * Measured 2026-09-10: `CATEGORY_PAGE_SIZE = 12`, `SHOP_PAGE_SIZE = 24`,
 * `SUPPLIER_PAGE_SIZE = 24`. SECTIONS 35 and SECTIONS 31 both ask for 50.
 *
 * A test that asserted 50 would fail on working code, and changing the code to
 * 50 is a layout decision, not a bug fix: 12 is a whole number of rows in the
 * category grid at every breakpoint, and a 50-card archive on a phone is a
 * scroll nobody reaches the bottom of. So the divergence is recorded in
 * `docs/ARCHITECTURE-CATEGORY-PAGE.md` and left for the operator, and these
 * tests pin what "pagination works" actually means at ANY page size:
 *
 *   - a page never renders more cards than the archive says it holds,
 *   - when there is a second page, it exists and shows DIFFERENT products,
 *   - an out-of-range page clamps rather than 404s (already covered in
 *     `category.spec.ts`, not repeated here).
 *
 * The disjointness check is the one that earns its place. An off-by-one in the
 * `range(from, from + SIZE - 1)` arithmetic shows up as page 2 repeating page
 * 1's last row, or skipping a product entirely, and both of those render as a
 * perfectly healthy grid.
 */

/**
 * The archive route. `/shop` 301s here, and following the redirect on every
 * navigation would drop `?page=2` on the floor in exactly the test that needs
 * it.
 */
const ARCHIVE = '/products'

/**
 * Product slugs rendered in the grid, after the archive has settled.
 *
 * THE WAIT IS LOAD-BEARING. These pages are partially prerendered: the shell
 * arrives first and the grid streams in behind it, so reading the DOM straight
 * after `goto` returns an empty list on a perfectly healthy archive. Measured
 * on 2026-09-10 -- the first version of this file skipped every test with "no
 * products in this catalogue" against a catalogue that had them.
 *
 * The empty-state string is waited for as well, so a genuinely empty archive
 * resolves in a second rather than costing the full timeout.
 */
async function slugsOn(page: import('@playwright/test').Page): Promise<string[]> {
  const card = page.locator('a[href^="/product/"]').first()
  const empty = page.getByText('לא נמצאו מוצרים התואמים את הבחירה שלך.')
  await card
    .or(empty)
    .waitFor({ state: 'visible', timeout: 20_000 })
    .catch(() => {})

  const hrefs = await page
    .locator('a[href^="/product/"]')
    .evaluateAll((nodes) =>
      nodes.map((node) => (node as HTMLAnchorElement).getAttribute('href') ?? ''),
    )
  return [...new Set(hrefs.filter(Boolean))]
}

test.describe('archive pagination', () => {
  test('the shop archive puts different products on page 2', async ({ page }) => {
    await page.goto(ARCHIVE)

    const first = await slugsOn(page)
    test.skip(first.length === 0, 'shop archive renders no products in this catalogue')

    await page.goto(`${ARCHIVE}?page=2`)
    const second = await slugsOn(page)

    // An archive smaller than one page clamps page 2 back to page 1, which is
    // the documented behaviour and not a pagination bug. Nothing to compare.
    test.skip(
      second.length === 0 || JSON.stringify(second) === JSON.stringify(first),
      'the catalogue does not fill a second page',
    )

    // The off-by-one this exists for: a repeated product means `from` overlaps
    // the previous range, and both pages still look healthy.
    const overlap = second.filter((slug) => first.includes(slug))
    expect(overlap, `page 2 repeats page 1: ${overlap.join(', ')}`).toEqual([])
  })

  test('page 1 never renders more products than the archive counts', async ({ page }) => {
    await page.goto(ARCHIVE)

    const shown = await slugsOn(page)
    test.skip(shown.length === 0, 'shop archive renders no products in this catalogue')

    // The count in the header is the archive's own claim about how many
    // products match. A grid holding more cards than the total is a filter that
    // was applied to the count and not to the query.
    const countText = await page.locator('.category-page__count').first().textContent()
    const total = Number((countText ?? '').replace(/[^0-9]/g, ''))
    test.skip(!Number.isFinite(total) || total === 0, 'archive prints no result count')

    expect(shown.length).toBeLessThanOrEqual(total)
  })
})
