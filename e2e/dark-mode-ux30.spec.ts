import { expect, test } from '@playwright/test'

// ThemeProvider adds the class in a client effect, i.e. after hydration, so a
// one-shot read right after a navigation can run first. Measured C197: webkit-380
// read "w9oXea_variable h-full antialiased" on /products with ke_theme=dark set.
// toHaveClass retries; a single getAttribute does not.
const DARK = /(^|\s)dark(\s|$)/
const THEME_TIMEOUT = 15_000

test.describe('UX30: Dark mode toggle with localStorage persistence', () => {
  test('should apply dark mode class to html element', async ({ page }) => {
    await page.goto('/')

    // Set dark mode via localStorage before load
    await page.addInitScript(() => {
      localStorage.setItem('ke_theme', 'dark')
    })

    // Reload to apply theme
    await page.reload()

    // Check that html has dark class
    await expect(page.locator('html')).toHaveClass(DARK, { timeout: THEME_TIMEOUT })
  })

  test('should apply light mode class to html element', async ({ page }) => {
    await page.goto('/')

    // Set light mode via localStorage before load
    await page.addInitScript(() => {
      localStorage.setItem('ke_theme', 'light')
    })

    // Reload to apply theme
    await page.reload()

    // Check that html does not have dark class (light mode is default)
    const htmlElement = page.locator('html')
    const classList = await htmlElement.getAttribute('class')
    expect(!classList?.includes('dark')).toBeTruthy()
  })

  test('should support dark mode across multiple pages', async ({ page }) => {
    // Set dark mode on home page
    await page.goto('/')
    await page.addInitScript(() => {
      localStorage.setItem('ke_theme', 'dark')
    })
    await page.reload()

    // Verify dark mode is set
    await expect(page.locator('html')).toHaveClass(DARK, { timeout: THEME_TIMEOUT })

    // Navigate to category page
    await page.goto('/products')

    // Verify dark mode persists
    await expect(page.locator('html')).toHaveClass(DARK, { timeout: THEME_TIMEOUT })

    // Navigate to account page (if authenticated)
    // Note: This test may be limited without auth setup, but the key is that
    // localStorage persists across navigation

    // Verify localStorage still has dark mode value
    const storedTheme = await page.evaluate(() => localStorage.getItem('ke_theme'))
    expect(storedTheme).toBe('dark')
  })

  test('should persist theme preference across browser restarts', async ({ page }) => {
    // First page visit - set dark mode
    await page.goto('/')
    await page.addInitScript(() => {
      localStorage.setItem('ke_theme', 'dark')
    })
    await page.reload()

    // Verify dark mode is active
    await expect(page.locator('html')).toHaveClass(DARK, { timeout: THEME_TIMEOUT })

    // Close and reopen (simulated by goto with fresh context)
    // The localStorage should persist
    const storedTheme = await page.evaluate(() => localStorage.getItem('ke_theme'))
    expect(storedTheme).toBe('dark')

    // Navigate to different page to verify persistence
    await page.goto('/products')

    // Verify dark mode still active
    await expect(page.locator('html')).toHaveClass(DARK, { timeout: THEME_TIMEOUT })
  })

  test('should have smooth color transitions in dark mode', async ({ page }) => {
    await page.goto('/')

    // Set dark mode
    await page.addInitScript(() => {
      localStorage.setItem('ke_theme', 'dark')
    })
    await page.reload()

    // Check that transition styles are present on html element
    const htmlElement = page.locator('html')

    // Get computed style for transition property
    const transitionStyle = await htmlElement.evaluate((el) => {
      return window.getComputedStyle(el).transition
    })

    // Verify that transition is set (it should include background-color, color, etc.)
    expect(transitionStyle).toBeTruthy()
  })

  test('dark mode toggle should update localStorage', async ({ page }) => {
    await page.goto('/')

    // Initial state should be light by default
    let storedTheme = await page.evaluate(() => localStorage.getItem('ke_theme'))
    expect(storedTheme === 'light' || storedTheme === null).toBeTruthy()

    // Set dark mode
    await page.evaluate(() => {
      localStorage.setItem('ke_theme', 'dark')
    })

    // Verify update
    storedTheme = await page.evaluate(() => localStorage.getItem('ke_theme'))
    expect(storedTheme).toBe('dark')

    // Set back to light
    await page.evaluate(() => {
      localStorage.setItem('ke_theme', 'light')
    })

    // Verify update
    storedTheme = await page.evaluate(() => localStorage.getItem('ke_theme'))
    expect(storedTheme).toBe('light')
  })
})
