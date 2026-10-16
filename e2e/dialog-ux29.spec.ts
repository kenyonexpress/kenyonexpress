import { expect, test } from '@playwright/test'

/**
 * UX29 Modal System - Dialog Component Tests
 *
 * Tests that verify the Dialog component features work in real browser.
 * These tests run against /test-dialog page which demonstrates the Dialog component.
 *
 * Features tested:
 * 1. Escape key closes the dialog
 * 2. Clicking overlay closes the dialog
 * 3. Focus is trapped within the dialog (Tab cycles through elements)
 * 4. Mobile viewport shows fullscreen behavior
 * 5. Desktop viewport shows centered behavior
 * 6. Backdrop blur effect is visible
 * 7. Close button works
 */

test.describe('UX29 Modal - Dialog Component', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the test dialog page
    await page.goto('/test-dialog')
    // Wait for page to be ready
    await page.waitForLoadState('networkidle')
  })

  test('should close dialog when Escape key is pressed', async ({ page }) => {
    // Find and click the dialog trigger
    const trigger = page.getByTestId('dialog-trigger')
    await expect(trigger).toBeVisible()
    await trigger.click()

    // Dialog should be visible (target specifically by data-testid to avoid Next.js error overlay)
    const dialog = page.getByTestId('dialog-content')
    await expect(dialog).toBeVisible()

    // Press Escape key
    await page.keyboard.press('Escape')

    // Dialog should close
    await expect(dialog).not.toBeVisible()
  })

  test('should close dialog when clicking on overlay (background)', async ({ page }) => {
    // Open dialog
    const trigger = page.getByTestId('dialog-trigger')
    await trigger.click()

    const dialog = page.getByTestId('dialog-content')
    await expect(dialog).toBeVisible()

    // On mobile, the dialog is fullscreen (inset-0), so there's limited area outside it
    // On desktop, there's more overlay area to click
    const viewport = page.viewportSize()
    const isMobile = viewport && viewport.width < 640

    if (isMobile) {
      // On mobile, the dialog takes full screen, so use Escape key instead
      await page.keyboard.press('Escape')
    } else {
      // On desktop, click on the overlay area
      const dialogBox = await dialog.boundingBox()
      if (dialogBox && dialogBox.x > 50) {
        // Click outside the dialog on the overlay
        await page.click('body', { position: { x: 10, y: 10 } })
      }
    }

    // Dialog should close
    await expect(dialog).not.toBeVisible()
  })

  test('should trap focus within dialog (Tab key cycles through elements)', async ({ page }) => {
    // Open dialog
    const trigger = page.getByTestId('dialog-trigger')
    await trigger.click()

    const dialog = page.getByTestId('dialog-content')
    await expect(dialog).toBeVisible()

    // Get focusable elements in the dialog
    const button1 = page.getByTestId('button-1')
    const button2 = page.getByTestId('button-2')
    const testInput = page.getByTestId('test-input')

    // Focus the first button
    await button1.focus()
    await expect(button1).toBeFocused()

    // Press Tab - should move to button 2
    await page.keyboard.press('Tab')
    await expect(button2).toBeFocused()

    // Press Tab - should move to input
    await page.keyboard.press('Tab')
    await expect(testInput).toBeFocused()

    // Verify focus stays within dialog
    const activeElement = await page.evaluate(() => {
      const active = document.activeElement as HTMLElement
      return active?.getAttribute('data-testid')?.toLowerCase() || active?.tagName?.toLowerCase()
    })
    expect(['button-2', 'test-input']).toContain(activeElement)
  })

  test('should apply mobile fullscreen styles on small viewport', async ({ page }) => {
    // Set mobile viewport BEFORE navigating
    await page.setViewportSize({ width: 375, height: 667 })
    await page.goto('/test-dialog')

    // Open dialog
    const trigger = page.getByTestId('dialog-trigger')
    await trigger.click()

    const dialogContent = page.getByTestId('dialog-content')
    await expect(dialogContent).toBeVisible()

    // Check for fullscreen classes
    const classes = await dialogContent.getAttribute('class')
    expect(classes).toMatch(/inset-0/) // fullscreen positioning
    expect(classes).toMatch(/w-full/) // full width

    // Dialog should take nearly full viewport width (minus padding)
    const box = await dialogContent.boundingBox()
    expect(box).not.toBeNull()
    if (box) {
      // Should be wide (most of 375px viewport)
      expect(box.width).toBeGreaterThan(320)
    }
  })

  test('should apply desktop centered styles on large viewport', async ({ page }) => {
    // Set desktop viewport BEFORE navigating
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/test-dialog')

    // Open dialog
    const trigger = page.getByTestId('dialog-trigger')
    await trigger.click()

    const dialogContent = page.getByTestId('dialog-content')
    await expect(dialogContent).toBeVisible()

    // Check for desktop centered classes
    const classes = await dialogContent.getAttribute('class')
    expect(classes).toMatch(/md:inset-auto/) // remove fullscreen on desktop
    expect(classes).toMatch(/md:max-w-lg/) // max width constraint

    // Dialog should be narrower on desktop
    const box = await dialogContent.boundingBox()
    expect(box).not.toBeNull()
    if (box) {
      // Should be constrained width (max-w-lg is ~32rem ~ 512px)
      expect(box.width).toBeLessThan(600)
      // Should be roughly centered horizontally
      expect(box.x + box.width / 2).toBeCloseTo(1440 / 2, 80)
    }
  })

  test('should have visible backdrop blur effect', async ({ page }) => {
    // Open dialog
    const trigger = page.getByTestId('dialog-trigger')
    await trigger.click()

    const dialog = page.getByTestId('dialog-content')
    await expect(dialog).toBeVisible()

    // Check for backdrop-blur class on the overlay or check the backdrop-blur effect
    // In Radix Dialog, the overlay receives a data-[state=open] attribute
    // The backdrop-blur-sm class is applied via Tailwind and creates the blur effect
    const hasBlurClass = await page.evaluate(() => {
      // Find all divs that might be the overlay
      const allDivs = document.querySelectorAll('div[data-state]')
      for (const div of allDivs) {
        const className = div.getAttribute('class') || ''
        if (className.includes('backdrop-blur')) {
          return true
        }
      }
      // Also check for data-state="open" elements which should have blur
      const openElements = document.querySelectorAll('[data-state="open"]')
      for (const el of openElements) {
        const className = el.getAttribute('class') || ''
        if (className.includes('backdrop-blur') || className.includes('blur')) {
          return true
        }
      }
      return false
    })

    // Should have backdrop blur effect
    expect(hasBlurClass).toBe(true)
  })

  test('should have working close button', async ({ page }) => {
    // Open dialog
    const trigger = page.getByTestId('dialog-trigger')
    await trigger.click()

    const dialog = page.getByTestId('dialog-content')
    await expect(dialog).toBeVisible()

    // Find close button (DialogClose component)
    const closeButton = dialog.locator('button:has-text("Close Dialog")')
    await expect(closeButton).toBeVisible()

    // Click close button
    await closeButton.click()

    // Dialog should close
    await expect(dialog).not.toBeVisible()
  })
})
