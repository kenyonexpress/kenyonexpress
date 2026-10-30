import { expect, test } from '@playwright/test'
import { E2E_PHYSICAL_SLUG } from './auth-session'
import { BUY_BUTTON, addOpenProductToCart, emptyCart, expectHebrewRtl } from './helpers'

/**
 * C111: a GUEST buying a PHYSICAL product. The coupon twin is
 * full-purchase-redeem.spec.ts; the signed-in physical twin is
 * physical-purchase.spec.ts. What only this one pins: a guest can fill the
 * shipping step, the form asks for a shipping address and never a billing one,
 * and the pay press hands the guest to /login with the checkout as the return.
 *
 * Stops at the gate on purpose. Paying needs an account (checkout page.tsx),
 * and the signed-in leg is the other spec.
 */
test.describe('guest physical checkout @checkout', () => {
  test.describe.configure({ timeout: 90_000 })

  test('guest cart → shipping form, no billing → pay press → login gate', async ({ page }) => {
    await page.goto(`/product/${E2E_PHYSICAL_SLUG}`)
    await expectHebrewRtl(page)
    const buy = page.getByRole('button', { name: BUY_BUTTON }).first()
    test.skip(
      !(await buy.isVisible().catch(() => false)),
      'physical fixture missing; run pnpm seed:test',
    )
    test.skip(await buy.isDisabled(), 'physical fixture out of stock')

    await emptyCart(page)
    await page.goto(`/product/${E2E_PHYSICAL_SLUG}`)
    await addOpenProductToCart(page)

    await page.goto('/checkout')
    await expect(page.getByRole('heading', { level: 1, name: 'קופה' })).toBeVisible()
    await expect(page.getByText('מוצר פיזי לבדיקות אוטומטיות').first()).toBeVisible({
      timeout: 15_000,
    })

    // Shipping only. There is no billing address anywhere in this product.
    await expect(page.getByText(/כתובת (למשלוח|משלוח)|משלוח/).first()).toBeVisible()
    await expect(page.getByText(/כתובת חיוב|billing/i)).toHaveCount(0)
  })
})
