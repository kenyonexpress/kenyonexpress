import { type Page, expect } from '@playwright/test'
import { E2E_CUSTOMER_EMAIL } from './auth-session'
import { BUY_BUTTON } from './helpers'

/**
 * Walks the four-step checkout (details, address, review, confirm) to the mock
 * Cardcom return. Address fields stay required on submit even for a coupon,
 * because handleSubmit validates every step, not only the visible one.
 */
export async function fillCheckoutAndPay(page: Page) {
  await expect(page.getByRole('heading', { name: 'קופה' })).toBeVisible({ timeout: 15_000 })

  const first = page.locator('#co-first-name')
  if (await first.isVisible().catch(() => false)) {
    await first.fill('לקוח')
    await page.locator('#co-last-name').fill('בדיקות')
    await page.locator('#co-phone').fill('0501234567')
    await page.locator('#co-email').fill(E2E_CUSTOMER_EMAIL)
    await page.getByRole('button', { name: 'המשך', exact: true }).click()
  }

  const city = page.locator('#co-city')
  if (await city.isVisible().catch(() => false)) {
    await city.fill('תל אביב')
    await page.locator('#co-street').fill('הרצל')
    await page.locator('#co-number').fill('1')
    await page.getByRole('button', { name: 'המשך', exact: true }).click()
  } else {
    const next = page.getByRole('button', { name: 'המשך', exact: true })
    if (await next.isVisible().catch(() => false)) await next.click()
  }

  const reviewNext = page.getByRole('button', { name: 'המשך לאישור' })
  if (await reviewNext.isVisible().catch(() => false)) {
    await reviewNext.click()
  }

  const terms = page.locator('input[name="accept_terms"]')
  if ((await terms.count()) > 0) await terms.check()

  await page.getByRole('button', { name: 'שליחת הזמנה' }).click()
  await page.waitForURL(/\/checkout\/return\?.*order_id=/, { timeout: 45_000 })
  await expect(page.getByRole('heading', { name: 'התשלום הצליח!' })).toBeVisible({
    timeout: 45_000,
  })
}

export async function addProductBySlug(page: Page, slug: string) {
  await page.goto(`/product/${slug}`)
  const buy = page.getByRole('button', { name: BUY_BUTTON }).first()
  await expect(buy).toBeVisible({ timeout: 15_000 })
  if (await buy.isDisabled()) throw new Error(`${slug} is not purchasable`)
  await buy.click()
  await expect(page.getByRole('button', { name: /נוסף לסל/ }).first()).toBeVisible()
}
