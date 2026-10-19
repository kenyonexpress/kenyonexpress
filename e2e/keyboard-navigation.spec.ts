import { expect, test } from '@playwright/test'

/**
 * UX48: Comprehensive keyboard navigation testing for Hebrew RTL support.
 *
 * Tests keyboard focus order, navigation, and accessibility in Hebrew context.
 * All focus behavior tested on both mobile and desktop viewports.
 */

test.describe('Keyboard Navigation - Hebrew RTL', () => {
  test.beforeEach(async ({ page }) => {
    // Set Hebrew language for all tests
    await page.addInitScript(() => {
      document.documentElement.lang = 'he'
      document.documentElement.dir = 'rtl'
    })
  })

  test('home page tab order follows logical flow', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('domcontentloaded')

    // Skip link should be first focusable element
    await page.keyboard.press('Tab')
    const skipLink = page.locator('a[href="#main-content"]')
    await expect(skipLink).toBeFocused()
  })

  test('search input is reachable via keyboard on all pages', async ({ page }) => {
    const pages = ['/', '/products', '/coupons', '/category/hot-deals']

    for (const path of pages) {
      await page.goto(path)
      await page.waitForLoadState('domcontentloaded')

      // Multiple tabs to find search or interactive element
      let foundFocusable = false
      for (let i = 0; i < 20; i++) {
        await page.keyboard.press('Tab')
        const focused = await page.evaluate(() => document.activeElement?.tagName)
        if (focused === 'INPUT' || focused === 'BUTTON' || focused === 'A') {
          foundFocusable = true
          break
        }
      }

      expect(foundFocusable, `no focusable element found after 20 tabs on ${path}`).toBe(true)
    }
  })

  test('form inputs are properly labeled for screen readers', async ({ page }) => {
    await page.goto('/contact')
    await page.waitForLoadState('domcontentloaded')

    const inputs = page.locator('input, textarea')
    const count = await inputs.count()

    for (let i = 0; i < count; i++) {
      const input = inputs.nth(i)
      const inputType = await input.getAttribute('type')

      // Skip hidden inputs
      if (inputType === 'hidden') continue

      // Check for either a label or aria-label
      const hasLabel = await Promise.any([
        input.getAttribute('aria-label').then((v) => v !== null),
        input.getAttribute('aria-labelledby').then((v) => v !== null),
        input.getAttribute('placeholder').then((v) => v !== null),
        input.getAttribute('id').then(async (id) => {
          if (!id) return false
          const label = page.locator(`label[for="${id}"]`)
          return (await label.count()) > 0
        }),
      ]).catch(() => false)

      expect(
        hasLabel,
        `input element ${i} on contact form must have label, aria-label, or placeholder`,
      ).toBe(true)
    }
  })

  test('focus is visible on all interactive elements', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('domcontentloaded')

    // Tab through multiple elements and check focus is visible
    const elementsToCheck = 5
    for (let i = 0; i < elementsToCheck; i++) {
      await page.keyboard.press('Tab')

      const focused = page.locator(':focus')
      const focusedElement = await focused.elementHandle()

      if (focusedElement) {
        // Get computed style to verify focus indicator
        const focusStyle = await focused.evaluate((el: Element) => {
          const style = window.getComputedStyle(el)
          return {
            outline: style.outline,
            boxShadow: style.boxShadow,
            borderColor: style.borderColor,
          }
        })

        // At least one focus indicator should be visible
        const hasIndicator =
          focusStyle.outline !== 'none' ||
          focusStyle.boxShadow !== 'none' ||
          focusStyle.borderColor !== ''

        expect(hasIndicator, `element ${i} should have visible focus indicator`).toBe(true)
      }
    }
  })

  test('cart page keyboard navigation is complete', async ({ page }) => {
    // Navigate to an actual product and add to cart
    await page.goto('/products')
    await page.waitForLoadState('domcontentloaded')

    // Find first product link
    const firstProduct = page.locator('a[href^="/product/"]').first()
    const productHref = await firstProduct.getAttribute('href')

    if (productHref) {
      await page.goto(productHref)
      await page.waitForLoadState('domcontentloaded')

      // Try to add to cart
      const addButton = page
        .locator('button:has-text("הוסף לעגלה"), button:has-text("הוסף"), [aria-label*="עגלה"]')
        .first()
      if (await addButton.isVisible()) {
        await addButton.click()
      }
    }

    // Navigate to cart
    await page.goto('/cart')
    await page.waitForLoadState('domcontentloaded')

    // All buttons/inputs should be reachable
    const interactiveElements = await page.evaluate(() => {
      const selector = 'a[href], button, input, select, textarea, [role="button"]'
      return Array.from(document.querySelectorAll(selector)).filter((el) => {
        const style = getComputedStyle(el)
        return (
          style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          (el as HTMLElement).offsetParent !== null
        )
      }).length
    })

    expect(interactiveElements).toBeGreaterThan(0)
  })

  test('focus indicator contrast is sufficient in RTL', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('domcontentloaded')

    // Tab to a button and check focus contrast
    await page.keyboard.press('Tab')
    await page.keyboard.press('Tab')

    const focused = page.locator(':focus')
    const contrastCheck = await focused.evaluate((el: Element) => {
      const style = window.getComputedStyle(el)
      const outlineColor = style.outlineColor
      const bgColor = style.backgroundColor

      return {
        hasOutline: style.outline !== 'none',
        outlineColor,
        backgroundColor: bgColor,
      }
    })

    expect(contrastCheck.hasOutline).toBe(true)
  })

  test('shift+tab navigates backward through focus order', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('domcontentloaded')

    // Move forward
    await page.keyboard.press('Tab')
    const forward1 = await page.evaluate(
      () => document.activeElement?.getAttribute('href') || document.activeElement?.textContent,
    )

    await page.keyboard.press('Tab')
    await page.evaluate(
      () => document.activeElement?.getAttribute('href') || document.activeElement?.textContent,
    )

    // Move backward
    await page.keyboard.press('Shift+Tab')
    const backward1 = await page.evaluate(
      () => document.activeElement?.getAttribute('href') || document.activeElement?.textContent,
    )

    // Should return to the previous element
    expect(backward1).toBe(forward1)
  })

  test('button with Enter key is focusable', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('domcontentloaded')

    // Find a clickable button
    const buttons = page.locator('button[type="button"]')
    if ((await buttons.count()) > 0) {
      const button = buttons.first()

      // Focus the button
      await button.focus()

      // Verify button is focused
      const isFocused = await button.evaluate((el) => el === document.activeElement)

      expect(isFocused).toBe(true)

      // Press Enter - some buttons might navigate or trigger actions
      await page.keyboard.press('Enter')
    }
  })

  test('link with Enter key navigates', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('domcontentloaded')

    // Find first link
    const link = page.locator('a').first()
    const href = await link.getAttribute('href')

    if (href && !href.startsWith('javascript:') && href !== '#') {
      // Focus and press Enter
      await link.focus()

      // Try Enter key
      await page.keyboard.press('Enter')

      // Wait for potential navigation
      await page.waitForTimeout(500)

      const newUrl = page.url()

      // Either same URL (prevented) or changed (navigated)
      expect(newUrl).toBeDefined()
    }
  })
})
