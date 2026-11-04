import { expect, test } from '@playwright/test'
import { expectHebrewRtl } from './helpers'

/**
 * READ-ONLY SMOKE, SAFE ON PRODUCTION (C202).
 *
 * The one spec written to be aimed at www.kenyonexpress.co.il. Every request
 * the page makes with a writing method (POST, PUT, PATCH, DELETE) is aborted
 * before it leaves the browser, so nothing here can create a cart row, an
 * order or a session, whatever the page does on load. The spec fails if the
 * pages under test needed one of those requests to render.
 */

const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

test.describe('production read-only smoke', () => {
  let blocked: string[]

  test.beforeEach(async ({ page }) => {
    blocked = []
    await page.route('**/*', (route) => {
      const request = route.request()
      if (READ_METHODS.has(request.method())) return route.continue()
      blocked.push(`${request.method()} ${request.url()}`)
      return route.abort('blockedbyclient')
    })
  })

  test('home, a category and a product render in Hebrew RTL', async ({ page }) => {
    const home = await page.goto('/')
    expect(home?.status(), 'home status').toBeLessThan(400)
    await expectHebrewRtl(page)

    const categoryHref = await page.locator('a[href^="/category/"]').first().getAttribute('href')
    expect(categoryHref, 'home links no category').toBeTruthy()
    const category = await page.goto(categoryHref as string)
    expect(category?.status(), `${categoryHref} status`).toBeLessThan(400)

    const productHref = await page.locator('a[href^="/product/"]').first().getAttribute('href')
    expect(productHref, `${categoryHref} links no product`).toBeTruthy()
    const product = await page.goto(productHref as string)
    expect(product?.status(), `${productHref} status`).toBeLessThan(400)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

    // Aborted writes are reported, not failed: the page rendered without them.
    test.info().annotations.push({ type: 'blocked-writes', description: String(blocked.length) })
  })

  test('health, robots and sitemap answer', async ({ request }) => {
    for (const path of ['/api/ready', '/robots.txt', '/sitemap.xml']) {
      const res = await request.get(path)
      expect(res.status(), `${path} status`).toBe(200)
    }
  })
})
