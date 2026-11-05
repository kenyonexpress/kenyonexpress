import { type Page, expect, test } from '@playwright/test'

/**
 * S35: the filter chips under the category row, measured in a browser.
 *
 * The row is four links: open on the weekend, free shipping, under 99, newest.
 * The first two filter on `products.open_weekend` and `products.free_shipping`
 * (migration 262). There is no location chip.
 *
 * Nothing here depends on which products are ticked today. A chip that named a
 * column the database does not have would be Postgres 42703 and the page would
 * render its error boundary, so "the page answers with a grid or with the
 * empty sentence" is the assertion that the columns are real and readable by
 * the anonymous role. The set arithmetic (a filtered page is a subset of the
 * unfiltered one) holds for any data.
 */
const ARCHIVES = ['/category/electronics', '/products'] as const
const CHIP_IDS = ['weekend', 'shipping', 'under99', 'newest'] as const
const EMPTY_SENTENCE = 'לא נמצאו מוצרים התואמים את הבחירה שלך.'

/**
 * Everything is read inside `<main>`. The archive body streams into a Suspense
 * boundary, and React parks an arriving segment in a hidden `div#S:n` at the
 * end of `<body>` until it reveals it, which can be after the load event. For
 * that moment the document holds the row twice; only the one in `<main>` is
 * the page the customer sees. Measured: one row in `<main>` at every load, a
 * second in `div#S:2[hidden]` on roughly one load in six, gone within 3s.
 */
function main(page: Page) {
  return page.locator('main#main-content')
}

async function filterRow(page: Page) {
  const row = main(page).locator('nav.category-chips--filters')
  await expect(row).toHaveCount(1)
  await expect(row).toBeVisible()
  return row
}

function chip(page: Page, id: (typeof CHIP_IDS)[number]) {
  return main(page).getByTestId(`filter-chip-${id}`)
}

/** The product links in the grid, as a sorted list of hrefs. */
async function gridProducts(page: Page): Promise<string[]> {
  await expect(main(page).locator('.category-card, .category-page__empty').first()).toBeVisible()
  const hrefs = await main(page)
    .locator('.category-card a[href^="/product/"]')
    .evaluateAll((links) => links.map((a) => a.getAttribute('href') ?? ''))
  return [...new Set(hrefs)].sort()
}

for (const path of ARCHIVES) {
  test.describe(`filter chips on ${path}`, () => {
    test('the row is four links in order, with no location chip', async ({ page }) => {
      await page.goto(path)
      const row = await filterRow(page)
      const ids = await row
        .locator('[data-testid^="filter-chip-"]')
        .evaluateAll((chips) => chips.map((c) => c.getAttribute('data-testid')))
      expect(ids).toEqual(CHIP_IDS.map((id) => `filter-chip-${id}`))
      await expect(row.locator('button')).toHaveCount(0)
      await expect(page.getByTestId('filter-chip-near')).toHaveCount(0)
      await expect(row.locator('a')).toHaveCount(4)
    })

    test('free shipping narrows the grid to a subset and toggles back off', async ({ page }) => {
      await page.goto(path)
      const all = await gridProducts(page)

      await chip(page, 'shipping').click()
      await expect(page).toHaveURL(/[?&]shipping=free(&|$)/)
      await expect(chip(page, 'shipping')).toHaveAttribute('aria-current', 'true')
      const free = await gridProducts(page)
      expect(free.length).toBeLessThanOrEqual(all.length)
      // The first page of the unfiltered archive may not hold every filtered
      // row on /products; on a single-page archive the subset is exact.
      if (path !== '/products') {
        for (const href of free) expect(all).toContain(href)
      }

      await chip(page, 'shipping').click()
      await expect(page).not.toHaveURL(/shipping=free/)
      await expect(chip(page, 'shipping')).not.toHaveAttribute('aria-current', 'true')
    })

    test('open on the weekend answers with a grid or the empty sentence, never an error', async ({
      page,
    }) => {
      const response = await page.goto(`${path}?open=weekend`)
      expect(response?.status()).toBe(200)
      await expect(chip(page, 'weekend')).toHaveAttribute('aria-current', 'true')
      const products = await gridProducts(page)
      if (products.length === 0) {
        await expect(main(page).getByText(EMPTY_SENTENCE)).toBeVisible()
      }
      // Both chips at once is one query with two filters.
      await chip(page, 'shipping').click()
      await expect(page).toHaveURL(/open=weekend/)
      await expect(page).toHaveURL(/shipping=free/)
      await gridProducts(page)
    })

    test('the row does not widen the page at 380, 768 or 1440', async ({ page }) => {
      for (const width of [380, 768, 1440]) {
        await page.setViewportSize({ width, height: 900 })
        await page.goto(`${path}?shipping=free`)
        await filterRow(page)
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        )
        expect(overflow, `horizontal overflow at ${width}`).toBeLessThanOrEqual(0)
      }
    })
  })
}
