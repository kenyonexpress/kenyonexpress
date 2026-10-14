import { expect, test } from '@playwright/test'
import {
  CONSENT_COOKIE,
  CONSENT_WORDING_VERSION,
  serializeConsent,
} from '../src/lib/analytics/consent'
import { openPurchasableProduct } from './helpers'

/**
 * UX15 (14.10.2026): THE PRODUCT PAGE'S BUY ROW AND GALLERY AS CONTROLS,
 * read off the rendered page.
 *
 * Measured before (logs/ux15/before.json): the quantity was a bare number
 * field with the native spinner hidden (no way to change it without a
 * keyboard), the gallery magnified only on a tap or Enter (a resting mouse
 * did nothing), the thumbnails wrapped into rows, and nothing followed the
 * shopper once the buy row scrolled off the top.
 *
 * Now: a minus and a plus inside the same 140x41 box; a mouse magnifies by
 * resting on the photo and leaving restores it, with no pin on click; one
 * sideways thumbnail strip; and a bar with the name, the price, the chosen
 * quantity and the same add-to-cart that appears only once the real row has
 * scrolled off the top and leaves when it is back.
 */

type Page = import('@playwright/test').Page

/**
 * Consent decided through the COOKIE the server reads, not the localStorage
 * key: with the key alone the banner still renders, fixed to the bottom,
 * and at the desktop project's 720px it covers the lower third of the photo
 * frame, so a pointer resting there never reaches the gallery at all.
 */
async function preset(page: Page) {
  const base = new URL(test.info().project.use.baseURL ?? 'http://localhost:3000')
  await page.context().addCookies([
    {
      name: CONSENT_COOKIE,
      value: serializeConsent({ decision: 'denied', wordingVersion: CONSENT_WORDING_VERSION }),
      domain: base.hostname,
      path: '/',
    },
  ])
}

test.describe('product buy row and gallery (UX15)', () => {
  test.beforeEach(async ({ page }) => {
    await preset(page)
    await openPurchasableProduct(page)
  })

  test('the quantity box keeps its 140px width and steps with the two buttons', async ({
    page,
  }) => {
    const group = page.locator('.pdp-buy__qty-group')
    const field = page.getByLabel('כמות', { exact: true })
    const minus = page.getByRole('button', { name: 'הפחת כמות' })
    const plus = page.getByRole('button', { name: 'הוסף כמות' })

    const box = await group.boundingBox()
    expect(Math.round(box?.width ?? 0)).toBe(140)
    await expect(field).toHaveValue('1')
    await expect(minus).toBeDisabled()
    await plus.click()
    await plus.click()
    await expect(field).toHaveValue('3')
    await expect(minus).toBeEnabled()
    await minus.click()
    await expect(field).toHaveValue('2')
  })

  test('the thumbnails are one sideways strip, not rows', async ({ page }) => {
    // The strip exists only with two photos or more, and the first buyable
    // product has one: walk the catalogue for a product that has a strip.
    await page.goto('/products')
    const links = page.locator('a[href^="/product/"]')
    await expect(links.first()).toBeVisible({ timeout: 15_000 })
    const hrefs = [
      ...new Set(await links.evaluateAll((as) => as.map((a) => a.getAttribute('href')))),
    ]
    let strip = page.locator('.pdp-gallery__thumbs')
    for (const href of hrefs.slice(0, 40)) {
      if (!href) continue
      await page.goto(href)
      strip = page.locator('.pdp-gallery__thumbs')
      if ((await strip.count()) > 0) break
    }
    test.skip((await strip.count()) === 0, 'no product with two photos among the first forty')
    const style = await strip.evaluate((el) => {
      const s = getComputedStyle(el)
      return { wrap: s.flexWrap, overflowX: s.overflowX, height: el.getBoundingClientRect().height }
    })
    expect(style.wrap).toBe('nowrap')
    expect(['auto', 'scroll']).toContain(style.overflowX)
    // One row of 64px thumbnails plus the 2px of border room on each side.
    expect(style.height).toBeLessThanOrEqual(70)
  })

  test('a resting mouse magnifies the photo and leaving restores it', async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, 'no hover on a phone; the tap toggle is covered in product.spec')
    const frame = page.getByRole('region', { name: /תמונות המוצר/ })
    test.skip((await frame.count()) === 0, 'product has no images')
    const box = await frame.boundingBox()
    if (!box) throw new Error('frame has no box')

    // Moved again until it takes: a pointer event dispatched before the
    // frame has hydrated reaches no handler, and nothing re-sends it.
    await expect(async () => {
      await page.mouse.move(box.x + box.width * 0.25, box.y + box.height * 0.75)
      await page.mouse.move(box.x + box.width * 0.25 + 1, box.y + box.height * 0.75)
      expect(await frame.getAttribute('data-zoomed')).toBe('true')
    }).toPass({ timeout: 10_000 })
    await expect(frame).toHaveAttribute('data-zoom-mode', 'hover')
    // The frame's own box does not grow: the zoom is clipped inside it.
    const during = await frame.boundingBox()
    expect(during?.width).toBe(box.width)
    expect(during?.height).toBe(box.height)

    // A click pins nothing.
    await page.mouse.down()
    await page.mouse.up()
    await expect(frame).toHaveAttribute('data-zoom-mode', 'hover')

    await page.mouse.move(2, 2)
    await expect(frame).not.toHaveAttribute('data-zoomed', 'true')
  })

  test('a buy bar follows once the row is above the viewport, and leaves when it is back', async ({
    page,
  }) => {
    const bar = page.getByRole('region', { name: 'הוספה מהירה לסל' })
    await expect(bar).toHaveCount(0)

    const row = page.locator('.pdp-buy')
    await page.getByRole('button', { name: 'הוסף כמות' }).click()
    await row.evaluate((el) => {
      const top = el.getBoundingClientRect().top + window.scrollY
      window.scrollTo(0, top + el.getBoundingClientRect().height + 600)
    })
    await expect(bar).toBeVisible()
    await expect(bar).toContainText('₪')
    await expect(bar).toContainText('כמות: 2')
    const pinned = await bar.evaluate((el) => {
      const s = getComputedStyle(el)
      const b = el.getBoundingClientRect()
      return {
        position: s.position,
        bottomGap: window.innerHeight - b.bottom,
        reserved: Number.parseFloat(s.bottom),
      }
    })
    expect(pinned.position).toBe('fixed')
    // Pinned to the bottom edge, lifted only by what the page reserves under
    // it (the consent banner while it is up, the phone's cart bar).
    expect(Math.abs(pinned.bottomGap - pinned.reserved)).toBeLessThanOrEqual(1)
    const button = bar.getByRole('button')
    await expect(button).toBeEnabled()
    const size = await button.boundingBox()
    expect(size?.height ?? 0).toBeGreaterThanOrEqual(44)

    await page.evaluate(() => window.scrollTo(0, 0))
    await expect(bar).toHaveCount(0)
  })

  test('the bar adds exactly what the row would, and reports it', async ({ page }) => {
    const row = page.locator('.pdp-buy')
    await row.evaluate((el) => {
      const top = el.getBoundingClientRect().top + window.scrollY
      window.scrollTo(0, top + el.getBoundingClientRect().height + 600)
    })
    const bar = page.getByRole('region', { name: 'הוספה מהירה לסל' })
    await expect(bar).toBeVisible()
    await bar.getByRole('button').click()
    await expect(bar.getByRole('button')).toContainText('נוסף לסל')
    // The header's cart count agrees.
    await expect(page.locator('[data-mini-cart-trigger]').first()).toContainText(/1/)
  })
})
