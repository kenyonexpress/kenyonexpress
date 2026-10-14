import { type APIRequestContext, expect, test } from '@playwright/test'

/**
 * UX21: the results page's controls on a built server. The sort in the bar,
 * the filters disclosure under it, the active-filter chips above the grid,
 * the empty state's verified doors, and the pagination.
 *
 * Catalogue content is DB-driven, so the query is discovered at runtime: the
 * first of a few Hebrew words the facet API answers with at least one hit.
 * A narrowed-empty search is made with a city no product carries.
 */

type Facets = { total?: number; facets?: Record<string, Record<string, number>>; engine?: string }

const CANDIDATES = ['זוג', 'ספא', 'מלון', 'מסעדה', 'צימר', 'עיסוי']
const NO_SUCH_CITY = 'אין-עיר-כזו'

async function pickQuery(request: APIRequestContext): Promise<{ q: string; body: Facets } | null> {
  for (const q of CANDIDATES) {
    const res = await request.get(`/api/search/facets?q=${encodeURIComponent(q)}&limit=1`)
    if (!res.ok()) continue
    const body = (await res.json()) as Facets
    if ((body.total ?? 0) > 0) return { q, body }
  }
  return null
}

test.describe('search results page (UX21)', () => {
  test.beforeEach(async ({ context }) => {
    await context.addInitScript(() => {
      window.localStorage.setItem('ke_consent', 'denied.2')
    })
    await context.addCookies([
      { name: 'ke_consent', value: 'denied.2', domain: 'localhost', path: '/' },
    ])
  })

  test('carries a control bar whose sort rewrites the URL and keeps the query', async ({
    page,
    request,
  }) => {
    const picked = await pickQuery(request)
    test.skip(!picked, 'no candidate query finds a product in this catalogue')
    if (!picked) return

    await page.goto(`/search?q=${encodeURIComponent(picked.q)}`)
    const bar = page.locator('.search-control-bar')
    await expect(bar).toBeVisible()
    const sort = bar.getByRole('combobox', { name: 'מיון תוצאות החיפוש' })
    await expect(sort).toHaveValue('relevance')
    await sort.selectOption('price_asc')
    await page.waitForURL((url) => url.searchParams.get('sort') === 'price_asc')
    expect(new URL(page.url()).searchParams.get('q')).toBe(picked.q)
    await expect(page.locator('ul.category-products li').first()).toBeVisible()
    await expect(sort).toHaveValue('price_asc')
  })

  test('the count line names the engine for probes, never for people', async ({
    page,
    request,
  }) => {
    const picked = await pickQuery(request)
    test.skip(!picked, 'no candidate query finds a product in this catalogue')
    if (!picked) return

    await page.goto(`/search?q=${encodeURIComponent(picked.q)}`)
    const count = page.locator('.category-page__count').first()
    await expect(count).toHaveAttribute('data-engine', /meilisearch|database/)
    await expect(count).not.toContainText(/meilisearch|database/i)
    await expect(count).toContainText(/מוצר/)
  })

  test('the filters are one closed row in the first screen that opens to facet links with counts', async ({
    page,
    request,
  }) => {
    const picked = await pickQuery(request)
    test.skip(!picked, 'no candidate query finds a product in this catalogue')
    if (!picked) return

    await page.goto(`/search?q=${encodeURIComponent(picked.q)}`)
    const details = page.locator('details#search-filters')
    await expect(details).toBeVisible()
    await expect(details).not.toHaveAttribute('open', '')
    const summary = details.locator('summary')
    const box = await summary.boundingBox()
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44)
    // In the first screen, above the grid.
    const grid = page.locator('ul.category-products')
    const gridBox = await grid.boundingBox()
    expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(gridBox?.y ?? 0)
    expect(box?.y ?? Number.POSITIVE_INFINITY).toBeLessThan(page.viewportSize()?.height ?? 0)

    await summary.click()
    await expect(details).toHaveAttribute('open', '')
    const option = details.locator('.search-facets__option').first()
    await expect(option).toBeVisible()
    await expect(option.locator('.search-facets__count')).toHaveText(/\d+/)
    await expect(details.getByRole('heading', { name: 'סינון לפי מחיר' })).toBeVisible()
  })

  test('choosing a facet puts a removable chip above the grid, and the chip removes it', async ({
    page,
    request,
  }) => {
    const picked = await pickQuery(request)
    test.skip(!picked, 'no candidate query finds a product in this catalogue')
    if (!picked) return
    const typeValues = Object.keys(picked.body.facets?.type ?? {})
    test.skip(typeValues.length === 0, 'the query has no type facet to choose')

    await page.goto(`/search?q=${encodeURIComponent(picked.q)}`)
    await page.locator('details#search-filters summary').click()
    const typeSection = page.locator('.search-facets__section', { hasText: 'סוג' })
    await typeSection.locator('.search-facets__option').first().click()
    await page.waitForURL((url) => url.searchParams.has('type'))

    const strip = page.getByRole('navigation', { name: 'סינונים פעילים' })
    await expect(strip).toBeVisible()
    const stripBox = await strip.boundingBox()
    const gridBox = await page.locator('ul.category-products').boundingBox()
    expect(stripBox?.y ?? Number.POSITIVE_INFINITY).toBeLessThan(gridBox?.y ?? 0)
    const chip = strip.getByRole('link', { name: /הסרת הסינון סוג/ })
    await expect(chip).toBeVisible()
    await expect(page.locator('details#search-filters summary')).toContainText('(1)')

    await chip.click()
    await page.waitForURL((url) => !url.searchParams.has('type'))
    await expect(strip).toHaveCount(0)
  })

  test('a search narrowed to nothing offers the unfiltered results as one press', async ({
    page,
    request,
  }) => {
    const picked = await pickQuery(request)
    test.skip(!picked, 'no candidate query finds a product in this catalogue')
    if (!picked) return

    await page.goto(
      `/search?q=${encodeURIComponent(picked.q)}&city=${encodeURIComponent(NO_SUCH_CITY)}`,
    )
    const empty = page.getByTestId('search-empty-state')
    await expect(empty).toBeVisible()
    await expect(empty).toContainText(`לא נמצאו מוצרים עבור "${picked.q}"`)
    // The chip strip is ABOVE the empty state now, not 800px under it.
    const strip = page.getByRole('navigation', { name: 'סינונים פעילים' })
    await expect(strip).toBeVisible()
    expect((await strip.boundingBox())?.y ?? Number.POSITIVE_INFINITY).toBeLessThan(
      (await empty.boundingBox())?.y ?? 0,
    )
    const widen = empty.locator('a[data-widen]')
    await expect(widen).toBeVisible()
    await expect(widen).toContainText(String(picked.body.total))
    await widen.click()
    await page.waitForURL((url) => !url.searchParams.has('city'))
    await expect(page.locator('ul.category-products li').first()).toBeVisible()
  })

  test('a query nothing matches keeps the empty state the home spec reads', async ({ page }) => {
    await page.goto('/search?q=זזזחחחקקק')
    const empty = page.getByTestId('search-empty-state')
    await expect(empty).toContainText('לא נמצאו מוצרים עבור "זזזחחחקקק".')
    await expect(empty).toContainText('נסו מילת חיפוש אחרת.')
    await expect(empty.locator('a[data-widen]')).toHaveCount(0)
    await expect(page.locator('.search-control-bar')).toBeVisible()
  })

  test('pages the results when there are more than one page of them', async ({ page, request }) => {
    const picked = await pickQuery(request)
    test.skip(!picked, 'no candidate query finds a product in this catalogue')
    if (!picked) return

    await page.goto(`/search?q=${encodeURIComponent(picked.q)}`)
    const pagination = page.getByRole('navigation', { name: 'ניווט בין עמודים' })
    if ((picked.body.total ?? 0) > 24) {
      await expect(pagination).toBeVisible()
      await pagination.getByRole('link', { name: 'עמוד 2' }).click()
      await page.waitForURL((url) => url.searchParams.get('page') === '2')
      await expect(page.locator('.category-page__count').first()).toContainText('מתוך')
    } else {
      await expect(pagination).toHaveCount(0)
      expect(await page.locator('ul.category-products li').count()).toBe(picked.body.total)
    }
  })

  test('on a phone the bar carries a filters link that opens the disclosure', async ({
    page,
    request,
    isMobile,
  }) => {
    test.skip(!isMobile, 'the filters link is the phone slot of the bar')
    const picked = await pickQuery(request)
    test.skip(!picked, 'no candidate query finds a product in this catalogue')
    if (!picked) return

    await page.goto(`/search?q=${encodeURIComponent(picked.q)}`)
    const link = page.locator('.search-control-bar .category-control-bar__filters')
    await expect(link).toBeVisible()
    const box = await link.boundingBox()
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44)
    await link.click()
    await expect(page.locator('details#search-filters')).toHaveAttribute('open', '')
  })
})
