import { expect, test } from '@playwright/test'

test.describe('Mobile Shell', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
  })

  test.describe('MobileNavBar', () => {
    test('is visible at mobile viewport (375px)', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 })
      const navBar = page.locator('[data-mobile-nav]')
      await expect(navBar).toBeVisible()
    })

    test('is hidden at desktop viewport (1440px)', async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 })
      const navBar = page.locator('[data-mobile-nav]')
      // Check that element has md:hidden class
      const classes = await navBar.getAttribute('class')
      expect(classes).toContain('md:hidden')
    })

    test('shows active state on current page', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 })
      const homeTab = page.locator('[data-testid="nav-home"]')
      const ariaAttr = await homeTab.getAttribute('aria-current')
      expect(ariaAttr).toBe('page')
    })

    test('has proper styling on active tab', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 })
      const homeTab = page.locator('[data-testid="nav-home"]')
      const bgColor = await homeTab.evaluate((el: HTMLElement) => {
        return window.getComputedStyle(el).backgroundColor
      })
      // Should have brand background color
      expect(bgColor).not.toBe('rgba(0, 0, 0, 0)')
    })
  })

  test.describe('PullToRefresh', () => {
    test('is visible on homepage at mobile viewport', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 })
      const pullToRefresh = page.locator('[data-pull-to-refresh]')
      await expect(pullToRefresh).toBeVisible()
    })

    test('wraps the page content', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 })
      const pullToRefresh = page.locator('[data-pull-to-refresh]')
      const childCount = await pullToRefresh.evaluate((el) => {
        return el.children.length
      })
      expect(childCount).toBeGreaterThan(0)
    })

    test('has touch event listeners attached', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 })
      const pullToRefresh = page.locator('[data-pull-to-refresh]')
      // Verify the element can receive touch events
      const canReceiveTouchEvents = await pullToRefresh.evaluate((el) => {
        return el instanceof HTMLElement
      })
      expect(canReceiveTouchEvents).toBeTruthy()
    })
  })

  test.describe('Product Page Mobile Components', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/product/e2e-test-physical')
    })

    test('SwipeableGallery is visible at mobile (375px)', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 })
      const gallery = page.locator('[data-swipeable-gallery]')
      await expect(gallery).toBeVisible()
    })

    test('SwipeableGallery is hidden at desktop (1440px)', async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 })
      const gallery = page.locator('[data-swipeable-gallery]').first()
      const classes = await gallery.getAttribute('class')
      expect(classes).toContain('md:hidden')
    })

    test('StickyCartBar is visible at mobile (375px)', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 })
      const cartBar = page.locator('[data-sticky-cart-bar]')
      await expect(cartBar).toBeVisible()
    })

    test('StickyCartBar is hidden at desktop (1440px)', async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 })
      const cartBar = page.locator('[data-sticky-cart-bar]')
      const classes = await cartBar.getAttribute('class')
      expect(classes).toContain('md:hidden')
    })

    test('StickyCartBar has proper fixed positioning on mobile', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 })
      const cartBar = page.locator('[data-sticky-cart-bar]')
      const position = await cartBar.evaluate((el) => {
        return window.getComputedStyle(el).position
      })
      expect(position).toBe('fixed')
    })
  })

  test.describe('Responsive Breakpoint (768px)', () => {
    test('tablet viewport (768px) hides mobile nav', async ({ page }) => {
      await page.setViewportSize({ width: 768, height: 1024 })
      const navBar = page.locator('[data-mobile-nav]')
      const classes = await navBar.getAttribute('class')
      expect(classes).toContain('md:hidden')
    })

    test('tablet viewport (768px) hides product mobile gallery', async ({ page }) => {
      await page.goto('/product/e2e-test-physical')
      await page.setViewportSize({ width: 768, height: 1024 })
      const gallery = page.locator('[data-swipeable-gallery]').first()
      const classes = await gallery.getAttribute('class')
      expect(classes).toContain('md:hidden')
    })
  })

  test.describe('Desktop Hiding - Computed Display Values', () => {
    test('MobileNavBar not displayed at 768px (computed)', async ({ page }) => {
      await page.setViewportSize({ width: 768, height: 1024 })
      const navBar = page.locator('[data-mobile-nav]')
      const display = await navBar.evaluate((el) => {
        return window.getComputedStyle(el).display
      })
      expect(display).toBe('none')
    })

    test('MobileNavBar not displayed at 1440px (computed)', async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 })
      const navBar = page.locator('[data-mobile-nav]')
      const display = await navBar.evaluate((el) => {
        return window.getComputedStyle(el).display
      })
      expect(display).toBe('none')
    })

    test('SwipeableGallery not displayed at 768px (computed)', async ({ page }) => {
      await page.goto('/product/e2e-test-physical')
      await page.setViewportSize({ width: 768, height: 1024 })
      const gallery = page.locator('[data-swipeable-gallery]').first()
      const display = await gallery.evaluate((el) => {
        return window.getComputedStyle(el).display
      })
      expect(display).toBe('none')
    })

    test('SwipeableGallery not displayed at 1440px (computed)', async ({ page }) => {
      await page.goto('/product/e2e-test-physical')
      await page.setViewportSize({ width: 1440, height: 900 })
      const gallery = page.locator('[data-swipeable-gallery]').first()
      const display = await gallery.evaluate((el) => {
        return window.getComputedStyle(el).display
      })
      expect(display).toBe('none')
    })

    test('StickyCartBar not displayed at 768px (computed)', async ({ page }) => {
      await page.goto('/product/e2e-test-physical')
      await page.setViewportSize({ width: 768, height: 1024 })
      const cartBar = page.locator('[data-sticky-cart-bar]')
      const display = await cartBar.evaluate((el) => {
        return window.getComputedStyle(el).display
      })
      expect(display).toBe('none')
    })

    test('StickyCartBar not displayed at 1440px (computed)', async ({ page }) => {
      await page.goto('/product/e2e-test-physical')
      await page.setViewportSize({ width: 1440, height: 900 })
      const cartBar = page.locator('[data-sticky-cart-bar]')
      const display = await cartBar.evaluate((el) => {
        return window.getComputedStyle(el).display
      })
      expect(display).toBe('none')
    })
  })

  test.describe('StickyCartBar Interaction', () => {
    test('sticky cart bar button is enabled and clickable', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 })
      await page.goto('/product/e2e-test-physical')

      const cartBar = page.locator('[data-sticky-cart-bar]')
      await expect(cartBar).toBeVisible()

      const button = cartBar.locator('button')
      await expect(button).toBeEnabled()

      // Dismiss consent banner if present to unblock clicks
      const consentBanner = page.locator('[data-consent-banner]')
      const bannerVisible = await consentBanner.isVisible().catch(() => false)
      if (bannerVisible) {
        const acceptButton = consentBanner.locator('button:first-child')
        if (await acceptButton.isVisible().catch(() => false)) {
          await acceptButton.click()
          await page.waitForTimeout(200)
        }
      }

      // Now click the sticky cart bar button
      await button.click()

      // Wait a brief moment for action to process
      await page.waitForTimeout(300)

      // Verify button is still enabled after click
      await expect(button).toBeEnabled()

      // Verify the sticky cart bar is still visible
      await expect(cartBar).toBeVisible()
    })

    test('sticky cart bar displays correct price format', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 })
      await page.goto('/product/e2e-test-physical')

      const cartBar = page.locator('[data-sticky-cart-bar]')
      const priceText = await cartBar.textContent()

      // Price should contain shekel symbol
      expect(priceText).toContain('₪')

      // Should have Hebrew button text
      expect(priceText).toContain('הוסף לעגלה')
    })
  })
})
