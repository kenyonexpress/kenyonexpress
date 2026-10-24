import { type Page, test as base, expect } from '@playwright/test'
import { E2E_COUPON_SLUG, paidFlowEnabled } from './auth-session'
import {
  BUY_BUTTON,
  PAY_RETURN_TIMEOUT,
  addOpenProductToCart,
  emptyCart,
  expectHebrewRtl,
  newSignedInContext,
  submitCheckout,
  sharedCustomerTest as test,
} from './helpers'

/**
 * Customer cancel-and-refund (F05, Consumer Protection Law section 14ג):
 * the customer buys a coupon through the Cardcom mock, sees the cancel button
 * on the orders list, reads the terms and the fee on the cancel page, files the
 * notice, and a second notice is refused.
 *
 * Same stack as admin-refund.spec.ts (`pnpm seed:test`, paid flow on). The
 * request-validation edges at the bottom need no purchase and run anywhere.
 */

const NIL_ORDER = '00000000-0000-4000-8000-000000000000'

async function buyCouponAndGetOrderId(page: Page): Promise<string> {
  await page.goto(`/product/${E2E_COUPON_SLUG}`)
  const buyable = await page
    .getByRole('button', { name: BUY_BUTTON })
    .first()
    .isVisible()
    .catch(() => false)
  test.skip(!buyable, 'e2e-test-coupon is not purchasable; run pnpm seed:test')

  await emptyCart(page)
  await page.goto(`/product/${E2E_COUPON_SLUG}`)
  await addOpenProductToCart(page)
  await page.goto('/checkout')
  await submitCheckout(page)
  await page.waitForURL(/\/checkout\/return\?.*order_id=/, { timeout: PAY_RETURN_TIMEOUT })
  await expect(page.getByRole('heading', { name: 'התשלום הצליח!' })).toBeVisible({
    timeout: PAY_RETURN_TIMEOUT,
  })
  const orderId = new URL(page.url()).searchParams.get('order_id')
  expect(orderId, 'order_id on the return URL').toBeTruthy()
  return orderId as string
}

test.describe('customer cancel and refund @money', () => {
  test.describe.configure({ timeout: 150_000 })

  test.beforeEach(() => {
    test.skip(!paidFlowEnabled(), 'paid flow credentials disabled (E2E_PAID_FLOW=0)')
  })

  test('a paid order is cancelled from the account, once', async ({ browser }) => {
    const customer = await newSignedInContext(browser, 'customer')
    const page = await customer.newPage()
    const orderId = await buyCouponAndGetOrderId(page)

    // The orders list offers the button for the paid order.
    await page.goto('/account/orders')
    await expectHebrewRtl(page)
    const cancelLink = page.locator(`a[href="/account/orders/${orderId}/cancel"]`)
    await expect(cancelLink).toBeVisible({ timeout: 20_000 })
    await cancelLink.click()

    // The cancel page states the statutory terms and the estimate before commit.
    await expect(page.getByRole('heading', { name: 'ביטול הזמנה' })).toBeVisible()
    await expect(page.getByText('14 ימים')).toBeVisible()
    await expect(page.getByText('הערכת ההחזר')).toBeVisible()

    // The submit stays disabled until the customer confirms they read the terms.
    const submit = page.getByRole('button', { name: 'ביטול ההזמנה' })
    await expect(submit).toBeDisabled()
    await page.getByLabel('סיבת הביטול (לא חובה)').fill('בדיקת E2E: ביטול על ידי לקוח')
    await page.getByRole('checkbox').check()
    await expect(submit).toBeEnabled()
    await submit.click()

    await page.waitForURL(new RegExp(`/account/orders/${orderId}/cancel/done\\?r=`), {
      timeout: 30_000,
    })
    await expectHebrewRtl(page)

    // A second notice for the same order is refused, by the API as well as the page.
    const again = await customer.request.post(`/api/orders/${orderId}/cancel`, {
      data: {},
    })
    expect(again.status()).toBe(409)
    expect((await again.json()).code).toBe('ALREADY_OPEN')
    await customer.close()
  })

  test('the API files one notice and ignores a ground chosen by the caller', async ({
    browser,
  }) => {
    const customer = await newSignedInContext(browser, 'customer')
    const page = await customer.newPage()
    const orderId = await buyCouponAndGetOrderId(page)

    // `defect` waives the fee by statute; the customer's button cannot pick it.
    const res = await customer.request.post(`/api/orders/${orderId}/cancel`, {
      data: { reason: 'בדיקת E2E', ground: 'defect' },
    })
    expect(res.status()).toBe(201)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.refundId).toBeTruthy()
    expect(['requested', 'approved']).toContain(body.state)
    // The operator's review reasons are not for the customer.
    expect(body).not.toHaveProperty('manualReviewReasons')
    await customer.close()
  })

  test('someone else’s or a missing order reads as not found', async ({ browser }) => {
    const customer = await newSignedInContext(browser, 'customer')
    const res = await customer.request.post(`/api/orders/${NIL_ORDER}/cancel`, { data: {} })
    expect(res.status()).toBe(404)
    expect((await res.json()).code).toBe('NOT_FOUND')

    await customer.close()
  })

  test('the cancel page of a missing order is a 404, not a form', async ({ browser }) => {
    const customer = await newSignedInContext(browser, 'customer')
    const page = await customer.newPage()
    await page.goto(`/account/orders/${NIL_ORDER}/cancel`)
    // Streamed under Suspense, so the status line is already 200: assert on the
    // content instead of the status.
    await expect(page.getByRole('heading', { name: 'ביטול הזמנה' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'ביטול ההזמנה' })).toHaveCount(0)
    await customer.close()
  })
})

base.describe('cancel API request validation', () => {
  base('a signed-out caller is refused', async ({ request }) => {
    const res = await request.post(`/api/orders/${NIL_ORDER}/cancel`, { data: {} })
    expect(res.status()).toBe(401)
    expect((await res.json()).code).toBe('UNAUTHENTICATED')
  })

  base('an id that is not a UUID is a 404', async ({ request }) => {
    const res = await request.post('/api/orders/not-a-uuid/cancel', { data: {} })
    expect(res.status()).toBe(404)
  })

  base('a body that is not JSON is refused', async ({ request }) => {
    const form = await request.post(`/api/orders/${NIL_ORDER}/cancel`, {
      form: { reason: 'x' },
    })
    expect(form.status()).toBe(415)

    const broken = await request.post(`/api/orders/${NIL_ORDER}/cancel`, {
      headers: { 'content-type': 'application/json' },
      data: Buffer.from('{not json'),
    })
    expect(broken.status()).toBe(400)
  })

  base('a reason over 500 characters is refused', async ({ request }) => {
    const res = await request.post(`/api/orders/${NIL_ORDER}/cancel`, {
      data: { reason: 'א'.repeat(501) },
    })
    expect(res.status()).toBe(400)
  })

  base('GET is not offered', async ({ request }) => {
    const res = await request.get(`/api/orders/${NIL_ORDER}/cancel`)
    expect(res.status()).toBe(405)
  })
})
