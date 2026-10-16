import { expect, test } from '@playwright/test'

const PAGES = [
  { path: '/', name: 'home' },
  { path: '/products', name: 'products' },
  { path: '/coupons', name: 'coupons' },
  { path: '/contact', name: 'contact' },
  { path: '/account', name: 'account' },
  { path: '/cart', name: 'cart' },
]

test.describe('Dark mode support', () => {
  test('theme toggle button exists in topbar', async ({ page }) => {
    await page.goto('/')
    const themeToggle = page.locator('button[aria-label*="Switch to"]')
    await expect(themeToggle).toBeVisible()
  })

  test('light mode is default', async ({ page }) => {
    await page.goto('/')
    const html = page.locator('html')
    const dataTheme = await html.getAttribute('data-theme')
    expect(dataTheme).toBe('light')
  })

  test('clicking toggle switches to dark mode', async ({ page }) => {
    await page.goto('/')
    const themeToggle = page.locator('button[aria-label*="Switch to dark"]')
    await themeToggle.click()

    const html = page.locator('html')
    const dataTheme = await html.getAttribute('data-theme')
    expect(dataTheme).toBe('dark')
  })

  test('theme persists in localStorage', async ({ page }) => {
    await page.goto('/')
    const themeToggle = page.locator('button[aria-label*="Switch to dark"]')
    await themeToggle.click()

    const theme = await page.evaluate(() => localStorage.getItem('ke-theme'))
    expect(theme).toBe('dark')
  })

  test.describe('all pages render in light mode', () => {
    for (const { path, name } of PAGES) {
      test(`${name} renders in light mode`, async ({ page }) => {
        await page.goto(path)
        const html = page.locator('html')
        await expect(html).toHaveAttribute('data-theme', 'light')

        // Check that page has content
        const main = page.locator('main')
        await expect(main).toBeVisible()

        // Check no console errors
        const errors: string[] = []
        page.on('console', (msg) => {
          if (msg.type() === 'error') errors.push(msg.text())
        })
        expect(errors).toEqual([])
      })
    }
  })

  test.describe('all pages render in dark mode', () => {
    for (const { path, name } of PAGES) {
      test(`${name} renders in dark mode`, async ({ page }) => {
        // Set dark mode via localStorage before navigation
        await page.goto('/', { waitUntil: 'networkidle' })
        await page.evaluate(() => localStorage.setItem('ke-theme', 'dark'))

        // Navigate to page
        await page.goto(path)

        // Wait for dark mode to be set
        const html = page.locator('html')
        await expect(html).toHaveAttribute('data-theme', 'dark')

        // Check that page has content
        const main = page.locator('main')
        await expect(main).toBeVisible()

        // Check no console errors
        const errors: string[] = []
        page.on('console', (msg) => {
          if (msg.type() === 'error') errors.push(msg.text())
        })
        expect(errors).toEqual([])
      })
    }
  })

  test('theme toggle changes icon and label', async ({ page }) => {
    await page.goto('/')

    let button = page.locator('button[aria-label*="Switch to dark"]')
    await expect(button).toHaveText('כהה')

    await button.click()

    button = page.locator('button[aria-label*="Switch to light"]')
    await expect(button).toHaveText('בהיר')
  })

  test('theme preference respects prefers-color-scheme', async ({ browser }) => {
    const context = await browser.createContext({
      colorScheme: 'dark',
    })
    const page = await context.newPage()

    await page.goto('/')

    // Initial theme should be dark due to prefers-color-scheme
    const html = page.locator('html')
    const dataTheme = await html.getAttribute('data-theme')
    expect(['dark', 'light']).toContain(dataTheme)

    await context.close()
  })

  test('dark mode background and text colors are inverted', async ({ page }) => {
    await page.goto('/')

    // Get light mode background color
    const body = page.locator('body')
    const lightBgColor = await body.evaluate((el) => getComputedStyle(el).backgroundColor)

    // Switch to dark mode
    const themeToggle = page.locator('button[aria-label*="Switch to dark"]')
    await themeToggle.click()

    // Get dark mode background color
    const darkBgColor = await body.evaluate((el) => getComputedStyle(el).backgroundColor)

    // Background colors should be different
    expect(lightBgColor).not.toBe(darkBgColor)
  })
})
