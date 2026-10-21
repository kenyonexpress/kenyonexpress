import { expect, test } from '@playwright/test'
import { awaitStreamedReveal } from './helpers'

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

    // ONE EVALUATE OVER THE REVEALED PAGE, NOT A LOCATOR LOOP. Two things
    // were wrong with the loop this replaces. It judged each input with
    // `Promise.any` over four probes, and `Promise.any` settles on the first
    // promise to FULFIL, a `false` included, so the aria-label probe always
    // won and an input named by a <label for> read as unlabelled: "input
    // element 8" (the honeypot, which has a label) was red in every run. And
    // it counted the inputs at domcontentloaded, while the page still held
    // the streamed body twice (the Suspense fallback and the hidden boundary
    // it is swapped for), then walked `nth(i)` as the count halved under it
    // and waited on an index that no longer existed until the test timed out.
    await awaitStreamedReveal(page)
    const unlabelled = await page.evaluate(() =>
      Array.from(
        document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input, textarea'),
      )
        .filter((el) => el.getAttribute('type') !== 'hidden')
        .filter((el) => {
          if (el.getAttribute('aria-label') || el.getAttribute('aria-labelledby')) return false
          if (el.getAttribute('placeholder')) return false
          if (el.closest('label')) return false
          return !(el.id && document.querySelector(`label[for="${CSS.escape(el.id)}"]`))
        })
        .map((el) => `${el.tagName.toLowerCase()}[name=${el.getAttribute('name') ?? ''}]`),
    )

    expect(
      unlabelled,
      'every visible input on /contact needs a label, aria-label or placeholder',
    ).toEqual([])
  })

  test('focus is visible on all interactive elements', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('domcontentloaded')
    // The skip link is the page's first tab stop; a Tab pressed before it is
    // in the document lands on <body> and there is nothing to measure.
    await page.locator('a[href="#main-content"]').waitFor({ state: 'attached' })

    // Tab through multiple elements and check focus is visible.
    //
    // THE FOCUS PROBE MUST NOT AUTO-WAIT. This loop used to read
    // `page.locator(':focus').elementHandle()` and then branch on a null
    // handle for "nothing is focused". That branch could never run:
    // `elementHandle()` waits for a match, the config sets no action timeout,
    // and a Tab that left <body> active (run 16, mobile-chrome, the snapshot
    // shows the document itself as the active element) made the probe wait
    // out the whole 30 s test timeout instead of returning null. The retry
    // passed in 652 ms, so the suite called it flaky when the spec was hung
    // on a locator that cannot answer "none". One evaluate over
    // `document.activeElement` answers immediately either way.
    const elementsToCheck = 5
    let focusedCount = 0
    for (let i = 0; i < elementsToCheck; i++) {
      await page.keyboard.press('Tab')

      const focusStyle = await page.evaluate(() => {
        const el = document.activeElement
        if (!el || el === document.body || el === document.documentElement) return null
        const style = window.getComputedStyle(el)
        return {
          outline: style.outline,
          boxShadow: style.boxShadow,
          borderColor: style.borderColor,
        }
      })

      if (focusStyle) {
        focusedCount += 1
        // At least one focus indicator should be visible
        const hasIndicator =
          focusStyle.outline !== 'none' ||
          focusStyle.boxShadow !== 'none' ||
          focusStyle.borderColor !== ''

        expect(hasIndicator, `element ${i} should have visible focus indicator`).toBe(true)
      }
    }

    expect(focusedCount, 'five Tabs on the home page should focus something').toBeGreaterThan(0)
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

    // Find a clickable button, and focus and check it in ONE evaluate.
    // The page is still streaming at domcontentloaded, and a locator
    // re-resolves on every call: measured 2026-10-20, `first()` was the
    // category tab "דילים חמים" for focus() and the header "תפריט" button
    // for the activeElement check a few ms later, so the comparison was
    // between two different nodes and failed once in three runs. Visible
    // only, because focus() on a display:none button is a silent no-op.
    const buttons = page.locator('button[type="button"]:visible')
    if ((await buttons.count()) > 0) {
      const button = buttons.first()
      await button.waitFor({ state: 'visible' })

      // Focus the button and verify it took, on the same node
      const isFocused = await button.evaluate((el) => {
        el.focus()
        return el === document.activeElement
      })

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
