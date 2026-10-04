import { type Page, expect, test } from '@playwright/test'
import { E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD, signInWithEmail } from './auth-session'
import { expectHebrewRtl } from './helpers'

/**
 * Admin product upload, end to end (W03): an admin creates one coupon and one
 * physical product through /admin/products/new, both land at the top of the
 * list, the coupon re-opens in the editor with its money intact, and both are
 * soft-deleted again from the list so the catalogue carries no test rows.
 *
 * Requires the admin fixture (`pnpm seed:test`, e2e-admin@ with role 'admin').
 * On an unseeded database (production is deliberately never seeded) the login
 * has no user behind it and the whole journey self-skips instead of failing.
 */

const STAMP = Date.now().toString(36)
const COUPON_NAME = `E2E קופון W03 ${STAMP}`
const COUPON_SLUG = `e2e-w03-coupon-${STAMP}`
const PHYSICAL_NAME = `E2E מוצר פיזי W03 ${STAMP}`
const PHYSICAL_SLUG = `e2e-w03-physical-${STAMP}`

async function openNewProductForm(page: Page): Promise<boolean> {
  try {
    await signInWithEmail(page, E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD, '/admin/products/new')
  } catch {
    return false
  }
  await page.goto('/admin/products/new')
  return page
    .getByRole('heading', { name: 'מוצר חדש' })
    .isVisible()
    .catch(() => false)
}

async function softDeleteFromList(page: Page, name: string): Promise<void> {
  await page.goto('/admin/products')
  const row = page.getByRole('row').filter({ hasText: name }).first()
  await expect(row).toBeVisible()
  await row.getByRole('button', { name: 'מחיקה' }).click()
  await row.getByRole('button', { name: 'כן, מחיקה' }).click()
  await expect(page.getByRole('row').filter({ hasText: name })).toHaveCount(0, {
    timeout: 15_000,
  })
}

test.describe('admin product upload @admin', () => {
  test.describe.configure({ timeout: 150_000 })

  test('an admin creates a coupon and a physical product, both reach the list, and are cleaned up', async ({
    page,
  }) => {
    const ready = await openNewProductForm(page)
    test.skip(!ready, 'admin fixture not available; run pnpm seed:test')
    await expectHebrewRtl(page)

    // ---- coupon -----------------------------------------------------------
    await page.locator('#name_he').fill(COUPON_NAME)
    // The slug is derived from the name as it is typed (slugify), then pinned
    // to a unique value so a re-run never collides with a leftover row.
    await expect(page.locator('#prod-slug')).not.toHaveValue('')
    await page.locator('#prod-slug').fill(COUPON_SLUG)
    await page.locator('#prod-type').selectOption('coupon')
    await page.locator('#description_he').fill('## מה כלול\n- עיסוי **שוודי**\n- סאונה')
    // Draft: publishing needs a complete supplier, which the fixture set does
    // not promise. The scheduled-publish field shows only on a draft.
    await expect(page.locator('#prod-status')).toHaveValue('draft')
    await expect(page.locator('#publish_at')).toBeVisible()
    await page.locator('#kenyon_price').fill('100')
    await page.locator('#platform_percent').fill('25')
    // The split pair completes itself: 25% platform means 75% supplier.
    await expect(page.locator('#supplier_split_percent')).toHaveValue('75')
    await page.locator('#coupon_price_ils').fill('35')
    // Coupon validity defaults to 90 of the 30/60/90 presets.
    await expect(page.locator('select[name="coupon_expiry_days"]').first()).toHaveValue('90')
    await page.locator('select[name="coupon_expiry_days"]').first().selectOption('60')
    await page.locator('#redemption_instructions_he').fill('להציג את הקוד בקבלה')
    await page.getByRole('button', { name: 'יצירת מוצר' }).click()
    await page.waitForURL(/\/admin\/products$/, { timeout: 30_000 })
    const couponRow = page.getByRole('row').filter({ hasText: COUPON_NAME }).first()
    await expect(couponRow).toBeVisible()
    await expect(couponRow).toContainText(COUPON_SLUG)

    // ---- the coupon re-opens with its money and type intact ---------------
    await couponRow.getByRole('link', { name: COUPON_NAME }).click()
    await page.waitForURL(/\/admin\/products\/[0-9a-f-]+\/edit$/)
    await expect(page.getByRole('heading', { name: 'עריכת מוצר' })).toBeVisible()
    await expect(page.locator('#prod-type')).toHaveValue('coupon')
    await expect(page.locator('#kenyon_price')).toHaveValue('100')
    await expect(page.locator('#coupon_price_ils')).toHaveValue('35')
    await expect(page.locator('select[name="coupon_expiry_days"]').first()).toHaveValue('60')
    await expect(page.locator('#description_he')).toHaveValue(/עיסוי \*\*שוודי\*\*/)

    // ---- physical ---------------------------------------------------------
    await page.goto('/admin/products/new')
    await page.locator('#name_he').fill(PHYSICAL_NAME)
    await page.locator('#prod-slug').fill(PHYSICAL_SLUG)
    await page.locator('#prod-type').selectOption('physical')
    await page.locator('#kenyon_price').fill('199.90')
    // A before-discount price makes its source mandatory, right in the form.
    await page.locator('#full_price').fill('249.90')
    await expect(page.locator('#original_price_source')).toHaveAttribute('required', '')
    await page.locator('#full_price').fill('')
    await expect(page.locator('#original_price_source')).not.toHaveAttribute('required', '')
    await page.locator('#platform_percent').fill('30')
    await page.locator('#stock_quantity').first().fill('25')
    // Physical terms: shipping defaults to 0 (free), the statutory window is the floor.
    await expect(page.locator('#shipping_price_ils')).toHaveValue('0')
    await page.getByRole('button', { name: 'יצירת מוצר' }).click()
    await page.waitForURL(/\/admin\/products$/, { timeout: 30_000 })
    const physicalRow = page.getByRole('row').filter({ hasText: PHYSICAL_NAME }).first()
    await expect(physicalRow).toBeVisible()
    await expect(physicalRow).toContainText(PHYSICAL_SLUG)

    // ---- cleanup: soft delete (deleted_at), the list's own control --------
    await softDeleteFromList(page, PHYSICAL_NAME)
    await softDeleteFromList(page, COUPON_NAME)
  })
})
