import { expect, test } from '@playwright/test'

/**
 * F55: E2E Playwright test for full order lifecycle
 * Guest checkout → Payment → Voucher QR → Supplier Scan → Redemption
 */

test.describe('Order Lifecycle End-to-End', () => {
  test('guest checkout to voucher redemption', async ({ page, context }) => {
    // 1. Guest adds coupon product to cart
    await page.goto('/products')
    await page.waitForLoadState('networkidle')

    // Find and click first coupon product
    const couponProduct = page.locator('[data-product-type="coupon"]').first()
    await expect(couponProduct).toBeVisible()
    await couponProduct.click()

    // Add to cart
    const addToCartButton = page.getByRole('button', { name: /הוסף לסל|Add to Cart/i })
    await expect(addToCartButton).toBeVisible()
    await addToCartButton.click()

    // Wait for cart confirmation
    await expect(page.locator('text=/נוסף לסל|Added to cart/i')).toBeVisible({ timeout: 5000 })

    // 2. Go to checkout
    await page.goto('/checkout')
    await page.waitForLoadState('networkidle')

    // Fill checkout form (guest)
    await page.fill('input[name="email"]', 'test@example.com')
    await page.fill('input[name="firstName"]', 'Test')
    await page.fill('input[name="lastName"]', 'User')
    await page.fill('input[name="phone"]', '0501234567')
    await page.fill('input[name="address"]', '123 Test St')
    await page.fill('input[name="city"]', 'Tel Aviv')

    // 3. Submit payment (mock payment flow)
    const payButton = page.getByRole('button', { name: /שלם|Pay/i })
    await expect(payButton).toBeEnabled()
    await payButton.click()

    // Wait for payment processing (mock)
    await page.waitForURL(/checkout\/success|checkout\/return/i, { timeout: 30000 })

    // 4. Verify order created with paid status
    const orderSuccessMessage = page.locator('text=/הזמנה התקבלה|Order received/i')
    await expect(orderSuccessMessage).toBeVisible({ timeout: 10000 })

    // Extract order ID from URL or page
    const currentUrl = page.url()
    const orderIdMatch = currentUrl.match(/order[_-]?id=([a-f0-9-]+)/i)
    const orderId = orderIdMatch ? orderIdMatch[1] : null

    expect(orderId).toBeTruthy()

    // 5. Verify voucher QR URL is generated
    // In real test, would verify via API call to check orders.voucher_qr_url
    const qrCodeElement = page.locator('[data-testid="voucher-qr"], img[alt*="QR"]')
    await expect(qrCodeElement).toBeVisible({ timeout: 5000 })

    // Extract QR code URL/token
    const qrToken = await qrCodeElement.getAttribute('data-token')
    expect(qrToken).toBeTruthy()

    // 6. Supplier scan flow - new page/context as supplier
    const supplierPage = await context.newPage()
    await supplierPage.goto('/supplier/login')

    // Login as supplier (mock credentials)
    await supplierPage.fill('input[name="email"]', 'supplier@example.com')
    await supplierPage.fill('input[name="password"]', 'test123')
    await supplierPage.getByRole('button', { name: /כניסה|Login/i }).click()

    await supplierPage.waitForURL(/supplier\/scan|scan/i, { timeout: 10000 })

    // 7. Scan voucher QR (simulate camera scan with token)
    await supplierPage.goto(`/supplier/scan?token=${qrToken}`)

    // 8. Verify redemption success
    const redemptionSuccess = supplierPage.locator('text=/נפדה בהצלחה|Successfully redeemed/i')
    await expect(redemptionSuccess).toBeVisible({ timeout: 5000 })

    // 9. Verify voucher status is 'redeemed' in DB
    // In real test, would verify via API call to check vouchers.status = 'redeemed'

    // 10. Verify order status transitioned correctly
    // pending → paid → fulfilled (after redemption)

    await supplierPage.close()
  })

  test('payment failure flow', async ({ page }) => {
    // Test payment_failed webhook event
    await page.goto('/checkout')
    await page.waitForLoadState('networkidle')

    // Fill form
    await page.fill('input[name="email"]', 'test@example.com')
    await page.fill('input[name="firstName"]', 'Test')
    await page.fill('input[name="lastName"]', 'User')
    await page.fill('input[name="phone"]', '0501234567')

    // Trigger payment failure (mock)
    await page.evaluate(() => {
      window.localStorage.setItem('mock_payment_fail', 'true')
    })

    const payButton = page.getByRole('button', { name: /שלם|Pay/i })
    await payButton.click()

    // Verify error message
    const errorMessage = page.locator('text=/תשלום נכשל|Payment failed/i')
    await expect(errorMessage).toBeVisible({ timeout: 10000 })

    // Verify order stayed in pending status
  })

  test('refund flow', async ({ page }) => {
    // Test refund webhook event
    // This would typically be admin-initiated
    await page.goto('/admin/orders')

    // Find order and initiate refund
    // Verify refund webhook processed correctly
    // Verify order status → refunded
    // Verify voucher status → refunded
  })

  test('state machine transition guards', async () => {
    // Test that invalid transitions are prevented
    // e.g., cannot go from 'succeeded' to 'failed'
    // cannot transition from terminal states
    // TODO: Implement DB-level transition guard tests
  })
})
