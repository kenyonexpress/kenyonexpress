/**
 * RTL (Right-to-Left) verification across all pages at multiple viewports.
 * Ensures Hebrew UI elements render correctly with proper text direction.
 */

import { expect, test } from '@playwright/test'

const VIEWPORTS = [
  { width: 380, height: 800, name: 'mobile' },
  { width: 768, height: 1024, name: 'tablet' },
  { width: 1440, height: 900, name: 'desktop' },
]

const PAGES = [
  { url: '/', name: 'home' },
  { url: '/products', name: 'products' },
  { url: '/cart', name: 'cart' },
  { url: '/checkout', name: 'checkout' },
  { url: '/account', name: 'account' },
  { url: '/login', name: 'login' },
  { url: '/signup', name: 'signup' },
]

for (const viewport of VIEWPORTS) {
  test.describe(`RTL verification at ${viewport.name} (${viewport.width}px)`, () => {
    test.use({ viewport })

    for (const page of PAGES) {
      test(`${page.name} has correct RTL attributes`, async ({ page: p }) => {
        await p.goto(page.url)

        // Prove where we landed (checkout bounces to cart when empty)
        if (page.url === '/checkout') {
          await p.waitForURL(/\/(checkout|cart)/)
        }

        // Root html element should have dir="rtl"
        const htmlDir = await p.locator('html').getAttribute('dir')
        expect(htmlDir).toBe('rtl')

        // Body should have RTL styles
        const body = p.locator('body')
        const direction = await body.evaluate((el) => getComputedStyle(el).direction)
        expect(direction).toBe('rtl')

        // Hebrew text should be present (not just English)
        const bodyText = await body.textContent()
        expect(bodyText).toMatch(/[֐-׿]/) // Hebrew Unicode range
      })

      test(`${page.name} money amounts have correct bidi`, async ({ page: p }) => {
        await p.goto(page.url)

        // Look for money amounts (₪ symbol)
        const moneyElements = p.locator('text=/₪/')
        const count = await moneyElements.count()

        if (count > 0) {
          // Check first few money amounts
          for (let i = 0; i < Math.min(count, 3); i++) {
            const elem = moneyElements.nth(i)
            const text = await elem.textContent()

            // Money should be in format: "X.XX ₪" or "X,XXX.XX ₪" (digits before sign)
            // The ₪ sign should be after the numbers due to LRI/PDI isolates
            expect(text).toMatch(/[\d,]+\.?\d*\s*₪/)

            // Should contain bidi isolate characters (U+2066 LRI and U+2069 PDI)
            // or the number should appear before the shekel sign visually
            const hasIsolates = text?.includes('⁦') && text?.includes('⁩')
            const numberBeforeSign = /\d.*₪/.test(text || '')

            expect(hasIsolates || numberBeforeSign).toBeTruthy()
          }
        }
      })

      test(`${page.name} inputs have correct direction`, async ({ page: p }) => {
        await p.goto(page.url)

        // Email and phone inputs should be LTR
        const ltrInputs = p.locator('input[type="email"], input[type="tel"], input[dir="ltr"]')
        const ltrCount = await ltrInputs.count()

        for (let i = 0; i < ltrCount; i++) {
          const input = ltrInputs.nth(i)
          const dir = await input.getAttribute('dir')
          const direction = await input.evaluate((el) => getComputedStyle(el).direction)

          // Either explicit dir="ltr" or computed direction is ltr
          expect(dir === 'ltr' || direction === 'ltr').toBeTruthy()
        }

        // Text inputs (Hebrew) should inherit RTL
        const textInputs = p.locator('input[type="text"]:not([dir="ltr"])')
        const textCount = await textInputs.count()

        for (let i = 0; i < textCount; i++) {
          const input = textInputs.nth(i)
          const direction = await input.evaluate((el) => getComputedStyle(el).direction)

          // Should be RTL (inherited from document)
          expect(direction).toBe('rtl')
        }
      })
    }
  })
}

test.describe('RTL specific UI elements', () => {
  test('Navigation menu aligns to the right', async ({ page }) => {
    await page.goto('/')
    await page.setViewportSize({ width: 1440, height: 900 })

    const nav = page.locator('nav').first()
    if ((await nav.count()) > 0) {
      const textAlign = await nav.evaluate((el) => getComputedStyle(el).textAlign)
      const direction = await nav.evaluate((el) => getComputedStyle(el).direction)

      expect(direction).toBe('rtl')
      // In RTL, start aligns to the right
      expect(['right', 'start'].includes(textAlign)).toBeTruthy()
    }
  })

  test('Product cards maintain RTL layout', async ({ page }) => {
    await page.goto('/products')

    const productCards = page.locator('[data-testid="product-card"], .product-card').first()
    if ((await productCards.count()) > 0) {
      const direction = await productCards.evaluate((el) => getComputedStyle(el).direction)
      expect(direction).toBe('rtl')
    }
  })

  test('Cart items align RTL', async ({ page }) => {
    await page.goto('/cart')

    const cartItems = page.locator('[data-testid="cart-item"], .cart-item').first()
    if ((await cartItems.count()) > 0) {
      const direction = await cartItems.evaluate((el) => getComputedStyle(el).direction)
      expect(direction).toBe('rtl')
    }
  })
})
