import { expect, test } from '@playwright/test'
import {
  E2E_CUSTOMER_EMAIL,
  E2E_CUSTOMER_PASSWORD,
  E2E_SUPPLIER_EMAIL,
  E2E_SUPPLIER_PASSWORD,
  paidFlowEnabled,
  signInWithEmail,
} from './auth-session'

test.describe('supplier dashboard isolation', () => {
  test.beforeEach(() => {
    test.skip(!paidFlowEnabled(), 'paid flow credentials disabled (E2E_PAID_FLOW=0)')
  })

  test('a customer cannot open the supplier portal', async ({ page }) => {
    await signInWithEmail(page, E2E_CUSTOMER_EMAIL, E2E_CUSTOMER_PASSWORD, '/supplier')
    await page.goto('/supplier')
    await expect(page).not.toHaveURL(/\/supplier$/)
  })

  test('a supplier sees only their own orders and cannot write fulfillment', async ({ page }) => {
    await signInWithEmail(page, E2E_SUPPLIER_EMAIL, E2E_SUPPLIER_PASSWORD, '/supplier')
    await page.goto('/supplier')
    await expect(page.getByRole('heading', { name: 'לוח בקרה' })).toBeVisible({ timeout: 15_000 })
    await expect(
      page.getByText('לקריאה בלבד').or(page.getByText('לפי אחוז עמלת הפלטפורמה')),
    ).toBeVisible()

    await page.goto('/supplier/orders')
    await expect(page.getByRole('heading', { name: 'הזמנות' })).toBeVisible()
    await expect(page.getByText('התצוגה לקריאה בלבד')).toBeVisible()
    await expect(page.getByRole('button', { name: /שנה סטטוס|סמן כנשלח|מחק/ })).toHaveCount(0)
  })
})
