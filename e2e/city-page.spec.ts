import { expect, test } from '@playwright/test'

/**
 * `/city/[slug]` (STEP 64): the city landing pages, driven in a browser.
 *
 * WHAT THIS PROVES THAT THE UNIT TESTS CANNOT. The route serves two slug
 * kinds through one file, one ASCII and one percent-encoded Hebrew, and the
 * encoded kind is the one that breaks silently: a decode skipped once and the
 * seventeen live region URLs 404 while every unit test stays green. So both
 * kinds are fetched here, plus the unknown slug, plus the links between them.
 *
 * NO ASSERTION ON A DEAL BEING PRESENT. Measured 2026-10-08, no active product
 * or supplier in production carries a city, so every city page is empty there
 * and in any environment seeded from it. The page states that in words
 * (`data-testid="city-empty"`); a seeded environment renders the grid
 * (`data-testid="city-deals"`) instead. Either is a correct answer and the
 * test accepts exactly those two.
 */

const TEL_AVIV_CITY = '/city/tel-aviv'
const TEL_AVIV_REGION = '/city/%D7%AA%D7%9C-%D7%90%D7%91%D7%99%D7%91'
const SHARON_REGION = `/city/${encodeURIComponent('השרון')}`

test.describe('city pages', () => {
  test('a city page answers with the city in the title, H1 and breadcrumb', async ({ page }) => {
    const response = await page.goto(TEL_AVIV_CITY)
    expect(response?.status()).toBe(200)

    await expect(page).toHaveTitle(/קופונים ודילים בתל אביב/)
    await expect(page.getByRole('heading', { level: 1 })).toContainText('תל אביב')

    const crumbs = page.getByRole('navigation', { name: 'מסלול ניווט' })
    await expect(crumbs).toContainText('בית')
    // City -> region -> home: Tel Aviv sits in live's "תל אביב" region.
    await expect(crumbs.getByRole('link', { name: 'תל אביב' })).toHaveAttribute(
      'href',
      TEL_AVIV_REGION,
    )

    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /\/city\/tel-aviv$/)
    await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /תל אביב/)
  })

  test('a city page publishes the city as a Place and never a LocalBusiness', async ({ page }) => {
    await page.goto(TEL_AVIV_CITY)
    const blocks = await page
      .locator('script[type="application/ld+json"]')
      .evaluateAll((nodes) => nodes.map((n) => n.textContent ?? ''))
    const joined = blocks.join('\n')
    expect(joined).toContain('"BreadcrumbList"')
    expect(joined).toContain('"Place"')
    expect(joined).toContain('"GeoCoordinates"')
    expect(joined).not.toContain('LocalBusiness')
    expect(joined).not.toContain('aggregateRating')
  })

  test('a city page shows either its deals or an honest empty state', async ({ page }) => {
    await page.goto(TEL_AVIV_CITY)
    const grid = page.getByTestId('city-deals')
    const empty = page.getByTestId('city-empty')
    await expect(grid.or(empty).first()).toBeVisible()
    if (await empty.isVisible()) {
      await expect(empty).toContainText('עדיין אין דילים בתל אביב')
    } else {
      expect(await grid.locator('li').count()).toBeGreaterThan(0)
    }
    // Both states keep the way out.
    await expect(page.getByRole('link', { name: 'לכל הדילים' })).toBeVisible()
  })

  test('a region page lists its cities as links into their city pages', async ({ page }) => {
    const response = await page.goto(SHARON_REGION)
    expect(response?.status()).toBe(200)
    await expect(page.getByRole('heading', { level: 1 })).toContainText('השרון')

    const chips = page.getByRole('region', { name: 'יישובים באזור' }).getByRole('link')
    await expect(chips).toHaveCount(2)
    const hrefs = await chips.evaluateAll((nodes) => nodes.map((n) => n.getAttribute('href')))
    expect(hrefs).toEqual(['/city/herzliya', '/city/kfar-saba'])
  })

  test('the encoded Hebrew region slug still resolves', async ({ request }) => {
    const response = await request.get(TEL_AVIV_REGION)
    expect(response.status()).toBe(200)
    expect(await response.text()).toContain('dir="rtl"')
  })

  test('an unknown slug is a 404 that asks not to be indexed', async ({ page }) => {
    const response = await page.goto('/city/no-such-city')
    expect(response?.status()).toBe(404)
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/)
  })
})
