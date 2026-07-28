import { expect, test } from '@playwright/test'
import { addOpenProductToCart, openPurchasableProduct } from './helpers'

test.describe('checkout gate (guest)', () => {
  test('anonymous direct visit to /checkout is sent to login with a return path', async ({
    page,
  }) => {
    await page.goto('/checkout')
    await expect(page).toHaveURL(/\/login\?next=%2Fcheckout/, { timeout: 15000 })
  })

  test('the gate holds even with a populated guest cart', async ({ page }) => {
    await openPurchasableProduct(page)
    await addOpenProductToCart(page)

    await page.goto('/checkout')
    await expect(page).toHaveURL(/\/login\?next=%2Fcheckout/, { timeout: 15000 })
  })

  test('the cart CTA offers sign-in rather than a direct checkout link', async ({ page }) => {
    await openPurchasableProduct(page)
    await addOpenProductToCart(page)

    await page.goto('/cart')
    await expect(page.getByRole('button', { name: /המשך לתשלום/ })).toBeVisible()
    // A guest must not be handed a bare /checkout link that would bounce them.
    await expect(page.locator('a[href="/checkout"]')).toHaveCount(0)
  })

  /**
   * src/proxy.ts gates the entire /checkout subtree, not just /checkout, so a
   * guest never reaches the payment-outcome pages. Pinned because it is load
   * bearing in both directions: it keeps order data away from anonymous
   * visitors, and it means the Cardcom return URL only resolves for a caller
   * who still holds a session cookie after the third-party hop.
   */
  test.describe('the gate covers the whole /checkout subtree', () => {
    for (const path of ['/checkout/failed', '/checkout/return', '/checkout/return?order_id=abc']) {
      test(`${path} redirects a guest to login`, async ({ page }) => {
        await page.goto(path)
        // The proxy clones the incoming URL, so any original query params ride
        // along ahead of `next`; match on the param, not on its position.
        await expect(page).toHaveURL(/\/login\?.*next=%2Fcheckout%2F/, { timeout: 15000 })
        await expect(page.getByRole('heading', { name: 'כניסה לחשבון' })).toBeVisible()
      })
    }
  })

  test('the login gate keeps the return path same-site', async ({ page }) => {
    // safeNextPath rejects protocol-relative and off-site targets; a rejected
    // value must degrade to the site root rather than leak the redirect.
    await page.goto('/login?next=//evil.example.com')
    await expect(page.getByRole('heading', { name: 'כניסה לחשבון' })).toBeVisible()
    await expect(page.locator('a[href^="//evil.example.com"]')).toHaveCount(0)
  })
})
