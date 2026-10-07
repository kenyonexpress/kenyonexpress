import { expect, test } from '@playwright/test'
import { firstProductHref } from './helpers'

/**
 * STEP 33: THE FOUR DESIGN WIDTHS, AND NOTHING SCROLLS SIDEWAYS AT ANY OF THEM.
 *
 * 375 is the phone the shop is designed for (rtl-mobile.spec.ts guards a
 * harder 320 floor on its own), 768 is Tailwind md and the tablet reference,
 * 1024 is Tailwind lg, 1440 is the desktop reference viewport the parity gate
 * scores at. rtl-three-widths.spec.ts measures 380/768/1440, the parity trio,
 * and that is exactly why 1024 was never measured: the product page's
 * recommendations row was five fixed 230px cards from lg up, 1150px in a
 * 994px container, and every product page scrolled 141px sideways between
 * 1024 and 1199 while all three gates stayed green (measured 2026-10-07).
 *
 * The assertion is the document, not an element: a page that scrolls
 * sideways is what a person feels, whichever element did it.
 */

const WIDTHS = [375, 768, 1024, 1440] as const

const ROUTES = [
  '/',
  '/products',
  '/cart',
  '/coupons',
  '/contact',
  '/suppliers',
  '/login',
  '/signup',
  '/category/hot-deals',
  '/search?q=%D7%9E%D7%95%D7%A6%D7%A8',
  '/legal/terms',
  '/accessibility',
  '/offline',
  '/this-route-does-not-exist',
] as const

async function documentWidth(page: import('@playwright/test').Page) {
  // The images below the fold decide the height, not the width; waiting for
  // them only makes the gate slower.
  await page.waitForLoadState('domcontentloaded')
  await page.waitForTimeout(500)
  return page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    // RTL overflow lands on the LEFT: the inline-end side, which is the side
    // scrollWidth alone can miss on some engines. Both are asserted.
    minScrollX: (() => {
      const before = window.scrollX
      window.scrollTo(-10_000, window.scrollY)
      const min = window.scrollX
      window.scrollTo(before, window.scrollY)
      return min
    })(),
  }))
}

for (const width of WIDTHS) {
  test.describe(`${width}px`, () => {
    test.use({ viewport: { width, height: 900 } })

    for (const route of ROUTES) {
      test(`${route} has no horizontal scroll`, async ({ page }) => {
        await page.goto(route)
        const { scrollWidth, clientWidth, minScrollX } = await documentWidth(page)
        expect(scrollWidth, `${route} is ${scrollWidth}px wide in ${width}px`).toBeLessThanOrEqual(
          clientWidth + 1,
        )
        expect(minScrollX, `${route} scrolls ${-minScrollX}px to the left at ${width}px`).toBe(0)
      })
    }

    test('a real product page has no horizontal scroll', async ({ page }) => {
      // By catalogue link, not a hardcoded slug: a 404 measures narrow and passes.
      const href = await firstProductHref(page)
      await page.goto(href)
      const { scrollWidth, clientWidth, minScrollX } = await documentWidth(page)
      expect(scrollWidth, `${href} is ${scrollWidth}px wide in ${width}px`).toBeLessThanOrEqual(
        clientWidth + 1,
      )
      expect(minScrollX, `${href} scrolls ${-minScrollX}px to the left at ${width}px`).toBe(0)
    })
  })
}

test.describe('safe area', () => {
  test('the viewport meta opts into the notch with viewport-fit=cover', async ({ page }) => {
    // Without it env(safe-area-inset-*) is 0 on every phone and the insets
    // the fixed elements add are inert. Next writes the meta from
    // `viewport` in layout.tsx; this reads what the browser actually got.
    await page.goto('/')
    const content = await page.locator('meta[name="viewport"]').getAttribute('content')
    expect(content).toContain('viewport-fit=cover')
    expect(content).toContain('width=device-width')
  })

  test('the bottom-anchored fixed elements resolve their inset in the computed style', async ({
    page,
  }) => {
    // Headless Chromium reports 0px for every inset, so the value cannot be
    // asserted; what can be is that the expression survived the build (a
    // dropped env() leaves `bottom: auto` or the bare 1.25rem) and that the
    // fixed element is where the float says it is.
    await page.goto('/')
    const float = page.locator('.whatsapp-float')
    await expect(float).toBeVisible()
    const { position, bottom, viewportHeight, box } = await float.evaluate((el) => {
      const s = getComputedStyle(el)
      const r = el.getBoundingClientRect()
      return {
        position: s.position,
        bottom: s.bottom,
        viewportHeight: window.innerHeight,
        box: { bottom: r.bottom, left: r.left },
      }
    })
    expect(position).toBe('fixed')
    expect(bottom).toBe('20px') // calc(1.25rem + 0px)
    expect(Math.round(viewportHeight - box.bottom)).toBe(20)
    expect(Math.round(box.left)).toBe(20) // end = left under dir=rtl
  })
})
