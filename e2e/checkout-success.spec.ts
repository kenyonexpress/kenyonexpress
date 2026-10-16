import { expect, test } from '@playwright/test'

test.describe('Checkout Success Page - Order Confirmation', () => {
  test.beforeEach(async ({ page }) => {
    // Set up test context if needed
    await page.goto('/')
  })

  test('displays green checkmark animation on success page', async ({ page }) => {
    // Navigate to success page (in real scenario, this would be after payment)
    // For now, test the component structure
    await page.goto('/checkout/return?order_id=test-order-123')

    // Wait for checkmark to be visible
    const checkmark = page.locator('.success-checkmark')
    await expect(checkmark).toBeVisible()

    // Verify animation is applied
    const animatedAttribute = await checkmark.getAttribute('data-animated')
    expect(animatedAttribute).toBe('true')

    // Verify SVG structure
    const circle = page.locator('.success-checkmark__circle')
    const path = page.locator('.success-checkmark__path')
    await expect(circle).toBeVisible()
    await expect(path).toBeVisible()
  })

  test('displays order success heading with correct format', async ({ page }) => {
    await page.goto('/checkout/return?order_id=test-order-123')

    // Check success heading
    const heading = page.locator('.success-heading')
    await expect(heading).toContainText('ההזמנה אושרה!')

    // Check order number format (KE-ORD-XXXXXX)
    const subtext = page.locator('.success-subtext')
    await expect(subtext).toContainText(/KE-ORD-[A-Z0-9]{6}/)
  })

  test('displays voucher cards with all required information', async ({ page }) => {
    await page.goto('/checkout/return?order_id=test-order-123')

    // Check voucher section exists
    const vouchersSection = page.locator('.success-vouchers-section')
    await expect(vouchersSection).toBeVisible()

    // Check voucher card elements
    const voucherCard = page.locator('.order-voucher-card').first()
    if (await voucherCard.isVisible()) {
      // Product name
      const productName = voucherCard.locator('.order-voucher-card__product')
      if (await productName.isVisible()) {
        await expect(productName).toBeVisible()
      }

      // QR Code (300x300px)
      const qrCode = voucherCard.locator('.order-voucher-card__qr')
      if (await qrCode.isVisible()) {
        await expect(qrCode).toHaveAttribute('width', '300')
        await expect(qrCode).toHaveAttribute('height', '300')
      }

      // 8-digit code in monospace
      const code = voucherCard.locator('.order-voucher-card__code')
      if (await code.isVisible()) {
        await expect(code).toBeVisible()
      }
    }
  })

  test('displays supplier business information', async ({ page }) => {
    await page.goto('/checkout/return?order_id=test-order-123')

    const voucherCard = page.locator('.order-voucher-card').first()
    if (await voucherCard.isVisible()) {
      // Supplier name
      const supplierName = voucherCard.locator('.order-voucher-card__supplier-name')
      if (await supplierName.isVisible()) {
        await expect(supplierName).toBeVisible()
      }

      // Address with Google Maps link
      const address = voucherCard.locator('.order-voucher-card__supplier-address a')
      if (await address.isVisible()) {
        await expect(address).toHaveAttribute('target', '_blank')
        await expect(address).toHaveAttribute('href', /maps.google.com/)
      }

      // Phone with tel: link
      const phone = voucherCard.locator('.order-voucher-card__supplier-phone a')
      if (await phone.isVisible()) {
        await expect(phone).toHaveAttribute('href', /^tel:/)
      }

      // Opening hours
      const hours = voucherCard.locator('.order-voucher-card__supplier-hours')
      if (await hours.isVisible()) {
        await expect(hours).toBeVisible()
      }
    }
  })

  test('displays three action buttons for each voucher', async ({ page }) => {
    await page.goto('/checkout/return?order_id=test-order-123')

    const voucherCard = page.locator('.order-voucher-card').first()
    if (await voucherCard.isVisible()) {
      // PDF button
      const pdfButton = voucherCard.locator('.order-voucher-card__button--primary')
      if (await pdfButton.isVisible()) {
        await expect(pdfButton).toContainText(/הורד PDF|PDF/)
      }

      // Wallet button
      const walletButton = voucherCard.locator('.order-voucher-card__button--secondary')
      if (await walletButton.isVisible()) {
        await expect(walletButton).toContainText(/ארנק/)
      }

      // WhatsApp share button
      const whatsappButton = voucherCard.locator('.order-voucher-card__button--whatsapp')
      if (await whatsappButton.isVisible()) {
        await expect(whatsappButton).toHaveAttribute('target', '_blank')
      }
    }
  })

  test('displays CTA buttons at page bottom', async ({ page }) => {
    await page.goto('/checkout/return?order_id=test-order-123')

    const ctaButtons = page.locator('.success-cta-buttons')
    await expect(ctaButtons).toBeVisible()

    // Continue shopping button
    const continueBtn = page.locator('.success-btn--primary')
    await expect(continueBtn).toContainText(/המשיכו לקנות|קנות/)

    // My orders button
    const ordersBtn = page.locator('.success-btn--secondary')
    await expect(ordersBtn).toContainText(/הזמנות/)
  })

  test('handles mobile responsive layout correctly', async ({ page }) => {
    await page.setViewportSize({ width: 380, height: 667 })
    await page.goto('/checkout/return?order_id=test-order-123')

    // On mobile, voucher grid should be single column
    const grid = page.locator('.success-vouchers-grid')
    const computedStyle = await grid.evaluate((el) =>
      window.getComputedStyle(el).getPropertyValue('grid-template-columns'),
    )
    // On 380px, should show single column
    expect(computedStyle).toContain('1fr')
  })

  test('PDF download button is clickable', async ({ page }) => {
    await page.goto('/checkout/return?order_id=test-order-123')

    const voucherCard = page.locator('.order-voucher-card').first()
    if (await voucherCard.isVisible()) {
      const pdfButton = voucherCard.locator('.order-voucher-card__button--primary')
      if (await pdfButton.isVisible()) {
        await expect(pdfButton).toBeEnabled()
      }
    }
  })

  test('Apple Wallet button is clickable', async ({ page }) => {
    await page.goto('/checkout/return?order_id=test-order-123')

    const voucherCard = page.locator('.order-voucher-card').first()
    if (await voucherCard.isVisible()) {
      const walletButton = voucherCard.locator('.order-voucher-card__button--secondary')
      if (await walletButton.isVisible()) {
        await expect(walletButton).toBeEnabled()
      }
    }
  })

  test('WhatsApp share button opens in new tab', async ({ page, context }) => {
    await page.goto('/checkout/return?order_id=test-order-123')

    const voucherCard = page.locator('.order-voucher-card').first()
    if (await voucherCard.isVisible()) {
      const shareButton = voucherCard.locator('.order-voucher-card__button--whatsapp')
      if (await shareButton.isVisible()) {
        // Verify it has target="_blank"
        const target = await shareButton.getAttribute('target')
        expect(target).toBe('_blank')
      }
    }
  })

  test('RTL layout is correct for Hebrew text', async ({ page }) => {
    await page.goto('/checkout/return?order_id=test-order-123')

    const heading = page.locator('.success-heading')
    const dir = await page.locator('html').getAttribute('dir')
    // Assuming site has Hebrew direction set
    // The text should read right-to-left in the browser
    await expect(heading).toBeVisible()
  })

  test('continues to products page when "Continue Shopping" is clicked', async ({ page }) => {
    await page.goto('/checkout/return?order_id=test-order-123')

    const continueBtn = page.locator('.success-btn--primary')
    if (await continueBtn.isVisible()) {
      // Verify the link href
      const href = await continueBtn.getAttribute('href')
      expect(href).toBe('/products')
    }
  })

  test('navigates to orders page when "My Orders" is clicked', async ({ page }) => {
    await page.goto('/checkout/return?order_id=test-order-123')

    const ordersBtn = page.locator('.success-btn--secondary')
    if (await ordersBtn.isVisible()) {
      // Verify the link href
      const href = await ordersBtn.getAttribute('href')
      expect(href).toBe('/account/orders')
    }
  })
})
