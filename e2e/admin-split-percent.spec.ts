import { expect, test } from '@playwright/test'
import { E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD, signInWithEmail } from './auth-session'
import { FIXTURE_IDS, FIXTURE_SLUGS, db, dbEnabled, productSplit } from './db'

/**
 * The per-product split, edited in the admin console.
 *
 * WHERE THE EDIT REFLECTS, AND WHERE IT DELIBERATELY DOES NOT. This gate was
 * specified as "admin edits per-product split % and it reflects on product
 * page". The first half is real and is asserted below. The second half is a
 * decision this project has already made in the other direction, in writing:
 *
 *   src/components/storefront/ShippingInfo.tsx
 *   "What is deliberately absent: the platform/supplier split. platform_percent
 *    decides how the money divides AFTER the sale ... Surfacing it would expose
 *    the supplier's margin to shoppers and to competitors for no benefit to the
 *    buyer. The split is visible in the admin console and on the supplier
 *    portal, which is where it belongs."
 *
 * So a spec that asserted the new percent appears on /product/<slug> would not
 * be testing a regression, it would be requesting a leak. The customer pays the
 * same price whichever way the split falls; that is the whole point of a split.
 *
 * This file therefore pins BOTH directions, which is stronger than either:
 *   1. the edit lands, on the row and on the form that reads it back;
 *   2. the pair stays complementary, because the database CHECK requires
 *      supplier_split_percent + platform_percent = 100 and a form that let them
 *      drift would fail at the constraint with a 500 rather than a message;
 *   3. the shopper-facing product page does NOT show the number, and its price
 *      does not move when the split does.
 *
 * The consequence the customer CAN see is the order-line snapshot, which
 * coupon-settlement.spec.ts asserts against the same fixture percent.
 *
 * RESTORATION. The spec edits the seeded fixture product and puts it back in an
 * `afterAll`, so a failure mid-run leaves at most one fixture at the test value
 * and `pnpm seed:test` resets it. It never touches a real catalogue product.
 */

const FIXTURE_PLATFORM_PERCENT = 10
const EDITED_PLATFORM_PERCENT = 23
const EDITED_SUPPLIER_PERCENT = 77

const EDIT_URL = `/admin/products/${FIXTURE_IDS.physicalProduct}/edit`

test.describe('admin edits a product split @admin @money', () => {
  test.describe.configure({ timeout: 120_000, mode: 'serial' })

  test.beforeEach(async ({ page }) => {
    test.skip(!dbEnabled(), 'no service key in the environment; the row is unreadable')

    await signInWithEmail(page, E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD, EDIT_URL)
    const response = await page.goto(EDIT_URL)
    test.skip(
      response?.status() !== 200 || page.url().includes('/login'),
      'admin fixture or product fixture missing; run pnpm seed:test',
    )
  })

  test.afterAll(async () => {
    if (!dbEnabled()) return
    // Back to the seeded values, so the settlement specs keep asserting against
    // the percent their fixture comments name.
    await db()
      .from('products')
      .update({
        platform_percent: FIXTURE_PLATFORM_PERCENT,
        supplier_split_percent: 100 - FIXTURE_PLATFORM_PERCENT,
      })
      .eq('id', FIXTURE_IDS.physicalProduct)
  })

  test('the form loads the split the row currently holds', async ({ page }) => {
    const before = await productSplit(FIXTURE_IDS.physicalProduct)
    expect(before, 'physical fixture missing').toBeTruthy()

    await expect(page.locator('#platform_percent')).toHaveValue(
      String(Number(before?.platform_percent)),
    )
  })

  test('editing the platform half moves the supplier half to match, in the form', async ({
    page,
  }) => {
    // The pair is one fact with two spellings, and the form says so out loud:
    // "שני החצאים נשמרים ומצטרפים תמיד ל-100%". If this ever stops holding, the
    // save below hits the database CHECK instead and the admin sees a 500.
    // fill() dispatches the input event, which is what handlePlatformPercent
    // listens on; the supplier half is recomputed in the same tick.
    await page.locator('#platform_percent').fill(String(EDITED_PLATFORM_PERCENT))

    await expect(page.locator('#supplier_split_percent')).toHaveValue(
      String(EDITED_SUPPLIER_PERCENT),
    )
  })

  test('saving writes both halves to the row', async ({ page }) => {
    await page.locator('#platform_percent').fill(String(EDITED_PLATFORM_PERCENT))
    await page.getByRole('button', { name: 'עדכון מוצר' }).click()
    // upsertProduct redirects to the list on success; staying on the form means
    // it returned an error, which the form renders instead.
    await page.waitForURL(/\/admin\/products(\?|$)/, { timeout: 30_000 })

    const after = await productSplit(FIXTURE_IDS.physicalProduct)
    expect(Number(after?.platform_percent)).toBe(EDITED_PLATFORM_PERCENT)
    expect(Number(after?.supplier_split_percent)).toBe(EDITED_SUPPLIER_PERCENT)
    // The invariant the DB CHECK enforces, asserted here so a failure names the
    // rule rather than arriving as a constraint violation.
    expect(
      Number(after?.platform_percent) + Number(after?.supplier_split_percent),
      'supplier_split_percent + platform_percent must equal 100',
    ).toBe(100)
  })

  test('reopening the form shows the saved split, not the old one', async ({ page }) => {
    await page.locator('#platform_percent').fill(String(EDITED_PLATFORM_PERCENT))
    await page.getByRole('button', { name: 'עדכון מוצר' }).click()
    await page.waitForURL(/\/admin\/products(\?|$)/, { timeout: 30_000 })

    await page.goto(EDIT_URL)
    await expect(page.locator('#platform_percent')).toHaveValue(String(EDITED_PLATFORM_PERCENT))
    await expect(page.locator('#supplier_split_percent')).toHaveValue(
      String(EDITED_SUPPLIER_PERCENT),
    )
  })

  test('the shopper-facing page neither shows the split nor moves its price', async ({ page }) => {
    const productPage = `/product/${FIXTURE_SLUGS.physical}`

    await page.goto(productPage)
    const priceBefore = await page
      .locator('[data-pdp="summary"]')
      .getByText(/₪/)
      .first()
      .innerText()

    await page.goto(EDIT_URL)
    await page.locator('#platform_percent').fill(String(EDITED_PLATFORM_PERCENT))
    await page.getByRole('button', { name: 'עדכון מוצר' }).click()
    await page.waitForURL(/\/admin\/products(\?|$)/, { timeout: 30_000 })

    await page.goto(productPage)

    // The price the customer pays is independent of how it divides afterwards.
    const priceAfter = await page.locator('[data-pdp="summary"]').getByText(/₪/).first().innerText()
    expect(priceAfter).toBe(priceBefore)

    // And the margin stays off the page. Matched as a percentage rather than as
    // a bare number so an unrelated "23" elsewhere on the page cannot fail it.
    const body = await page.locator('body').innerText()
    for (const leak of [`${EDITED_PLATFORM_PERCENT}%`, `${EDITED_SUPPLIER_PERCENT}%`]) {
      expect(body, `the product page leaked the supplier margin (${leak})`).not.toContain(leak)
    }
  })
})

test.describe('the split gate is closed to everyone else @admin', () => {
  test('a signed-out visitor cannot open the product edit form', async ({ page }) => {
    await page.context().clearCookies()
    await page.goto(EDIT_URL)
    await page.waitForURL(/\/login/, { timeout: 15_000 })
    await expect(page.getByRole('heading', { name: 'כניסה לחשבון' })).toBeVisible()
  })
})
