import { expect, test } from '@playwright/test'

/**
 * Filter, then sort, then scroll. The shop appends pages of 20 from
 * GET /api/products until at least 40 product cards are on the page.
 *
 * The count line is the server's first window ("1–20 מתוך N"). The cards
 * are what infinite scroll adds, so the assertion counts cards, not that line.
 */
const SETTLED_COUNT = '.category-page__count:not(.category-page__count--pending)'

function catalogueTotal(text: string): number {
  const of = /מתוך\s+(\d+)/.exec(text)
  if (of?.[1]) return Number(of[1])
  const all = /כל\s+\D*(\d+)/.exec(text)
  return all?.[1] ? Number(all[1]) : 0
}

test.describe('shop sort and infinite scroll', () => {
  test('filter, sort by price, then scroll until 40 products are loaded', async ({ page }) => {
    await page.goto('/products')
    await expect(page.getByRole('heading', { name: 'חנות', level: 1 })).toBeVisible()

    await page.locator('.category-sidebar__summary').click()
    await page.locator('#price-min').fill('0')
    await page.locator('#price-max').fill('100000')
    await page.locator('.category-sidebar__price-btn').click()
    await page.waitForURL(/[?&]min=0\b/)
    await page.waitForURL(/[?&]max=100000\b/)

    const sort = page.getByLabel('מיון מוצרים')
    await expect(sort).toBeVisible()
    await expect(sort.locator('option')).toHaveText([
      'סידור ברירת מחדל',
      'למיין לפי פופולריות',
      'למיין לפי דירוג ממוצע',
      'למיין לפי המעודכן ביותר',
      'למיין מהזול ליקר',
      'למיין מהיקר לזול',
    ])
    await sort.selectOption('price')
    await page.waitForURL(/[?&]sort=price_asc\b/)

    const sortBox = await sort.boundingBox()
    const gridBox = await page.locator('.category-products').first().boundingBox()
    const width = page.viewportSize()?.width ?? 1280
    expect(sortBox, 'sort control has no box').not.toBeNull()
    expect(gridBox, 'product grid has no box').not.toBeNull()
    if (sortBox && gridBox) {
      expect(sortBox.x, 'sort sits on the visual left').toBeLessThan(width / 2)
      expect(sortBox.y, 'sort sits above the grid').toBeLessThan(gridBox.y)
    }

    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')

    const countText =
      (await page.locator(SETTLED_COUNT).first().textContent({ timeout: 15_000 })) ?? ''
    const total = catalogueTotal(countText)
    test.skip(total < 40, `catalogue has ${total} products after the price filter, need 40`)

    const cards = page.locator('a[href^="/product/"]')
    await expect(cards.first()).toBeVisible({ timeout: 15_000 })

    const listRequests: string[] = []
    page.on('request', (request) => {
      if (request.url().includes('/api/products?')) listRequests.push(request.url())
    })

    await expect
      .poll(
        async () => {
          await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
          return cards.count()
        },
        { timeout: 30_000, intervals: [250, 500, 1000] },
      )
      .toBeGreaterThanOrEqual(40)

    expect(
      listRequests.some((url) => {
        const params = new URL(url).searchParams
        return (
          params.get('sort') === 'price_asc' &&
          params.get('limit') === '20' &&
          params.get('min') === '0' &&
          params.get('max') === '100000' &&
          Number(params.get('page')) >= 2
        )
      }),
      `expected a filtered price_asc page from /api/products, saw ${listRequests.join(' | ')}`,
    ).toBe(true)
  })
})
