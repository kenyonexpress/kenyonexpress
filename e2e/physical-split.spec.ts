import { expect, test } from '@playwright/test'
import {
  E2E_CUSTOMER_EMAIL,
  E2E_CUSTOMER_PASSWORD,
  E2E_PHYSICAL_SLUG,
  E2E_SUPPLIER_EMAIL,
  E2E_SUPPLIER_PASSWORD,
  paidFlowEnabled,
  signInWithEmail,
} from './auth-session'
import { addProductBySlug, fillCheckoutAndPay } from './checkout-flow'

test.describe('physical purchase split @checkout @money', () => {
  test.describe.configure({ timeout: 120_000 })

  test.beforeEach(() => {
    test.skip(!paidFlowEnabled(), 'paid flow credentials disabled (E2E_PAID_FLOW=0)')
  })

  test('logged-in physical buy snapshots the split percent on supplier order history', async ({
    browser,
  }) => {
    const customer = await browser.newContext({ locale: 'he-IL', timezoneId: 'Asia/Jerusalem' })
    const page = await customer.newPage()
    await signInWithEmail(page, E2E_CUSTOMER_EMAIL, E2E_CUSTOMER_PASSWORD, '/')
    await addProductBySlug(page, E2E_PHYSICAL_SLUG)
    await page.goto('/checkout')
    await fillCheckoutAndPay(page)
    await customer.close()

    const supplier = await browser.newContext({ locale: 'he-IL', timezoneId: 'Asia/Jerusalem' })
    const orders = await supplier.newPage()
    await signInWithEmail(orders, E2E_SUPPLIER_EMAIL, E2E_SUPPLIER_PASSWORD, '/supplier/orders')
    await orders.goto('/supplier/orders')
    await expect(orders.getByRole('heading', { name: 'הזמנות' })).toBeVisible({ timeout: 15_000 })
    await expect(orders.getByText('מוצר פיזי לבדיקות אוטומטיות')).toBeVisible()
    await expect(orders.getByText('עמלה 10%')).toBeVisible()
    await expect(orders.getByText('מגיע לכם')).toBeVisible()
    await expect(orders.getByText('סמן כנשלח')).toHaveCount(0)
    await supplier.close()
  })
})
