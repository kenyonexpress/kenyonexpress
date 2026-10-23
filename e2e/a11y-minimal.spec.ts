import AxeBuilder from '@axe-core/playwright'
import { type Page, expect, test } from '@playwright/test'

/**
 * Minimal a11y tests for IS 5568 compliance on 4 core page types:
 * home, product, checkout (cart), account.
 *
 * This is a simplified suite that tests accessibility without requiring
 * complex setup like seeded carts or authenticated sessions.
 */

const WCAG_AA = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']

async function scan(page: Page) {
  // Wait for hydration
  await page.waitForLoadState('domcontentloaded')
  await page.waitForTimeout(1000) // Give React time to hydrate
  return new AxeBuilder({ page }).withTags(WCAG_AA).analyze()
}

function describe(results: Awaited<ReturnType<typeof scan>>) {
  return results.violations
    .map((v) => {
      const where = v.nodes
        .slice(0, 3)
        .map((n) => n.target.join(' '))
        .join(' | ')
      return `${v.id} (${v.impact}) x${v.nodes.length}: ${v.help}\n    ${where}`
    })
    .join('\n  ')
}

test.describe('IS 5568 - Core Page Types', () => {
  test('home page has no WCAG A/AA violations', async ({ page }) => {
    await page.goto('/')
    const results = await scan(page)
    expect(
      results.violations.map((v) => v.id),
      `/\n  ${describe(results)}`,
    ).toEqual([])
  })

  test('product page has no WCAG A/AA violations', async ({ page }) => {
    // Get first product link from home page
    await page.goto('/')
    const productLink = page.locator('a[href^="/product/"]').first()
    await expect(productLink).toBeVisible({ timeout: 10000 })
    const href = await productLink.getAttribute('href')

    if (!href) {
      test.skip(true, 'No product link found')
    }

    await page.goto(href as string)
    const results = await scan(page)
    expect(
      results.violations.map((v) => v.id),
      `${href}\n  ${describe(results)}`,
    ).toEqual([])
  })

  test('checkout page (cart) has no WCAG A/AA violations', async ({ page }) => {
    // Test the /cart page which is the entry point to checkout
    await page.goto('/cart')
    const results = await scan(page)
    expect(
      results.violations.map((v) => v.id),
      `/cart\n  ${describe(results)}`,
    ).toEqual([])
  })

  test('account page has no WCAG A/AA violations', async ({ page }) => {
    // Test the /account redirect target (login page for non-authenticated users)
    await page.goto('/account')
    await page.waitForLoadState('domcontentloaded')

    // If redirected to login, that's the page we scan
    const results = await scan(page)
    expect(
      results.violations.map((v) => v.id),
      `/account (or login redirect)\n  ${describe(results)}`,
    ).toEqual([])
  })
})
