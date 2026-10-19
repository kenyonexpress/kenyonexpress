import { expect, test } from '@playwright/test'
import { E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD, signInWithEmail } from './auth-session'
import { expectHebrewRtl } from './helpers'

/**
 * Admin product CRUD, and specifically the one rule in it that is a money rule.
 *
 * "Empty percent fields are a validation error, never a default." The schema
 * makes `platform_percent` nullable and optional so a content-only draft can
 * exist before anyone has agreed commercial terms, and `assertPublishable`
 * is what turns it into a hard requirement at the moment of publishing.
 * That split is deliberate and it is the thing worth testing: a default
 * anywhere in this path would silently set the platform's cut on a live
 * product, and there is no default anywhere on purpose (CONTRADICTIONS C1).
 *
 * NON-DESTRUCTIVE. Every assertion here is about a REFUSAL, so the run creates
 * no product and publishes nothing. The create-and-edit half of CRUD is
 * covered by the unit suite around `saveProduct` and `buildProductMoneyWrite`,
 * which can assert the written row directly instead of inferring it from a
 * screen; what only a browser can prove is that the form reaches those rules
 * at all and shows the refusal in Hebrew.
 *
 * Self-skips on an unseeded database, like every other spec here.
 */

test.describe('admin product CRUD @admin @money', () => {
  test.describe.configure({ timeout: 90_000 })

  test('the catalogue editor is reachable and speaks Hebrew', async ({ page }) => {
    await signInWithEmail(page, E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD, '/admin/products')
    await page.goto('/admin/products')

    const heading = page.getByRole('heading', { level: 1 })
    const visible = await heading.isVisible().catch(() => false)
    test.skip(!visible, 'admin fixture is not seeded; run pnpm seed:test')

    await expectHebrewRtl(page)
  })

  test('publishing without percentages is refused, and no default fills them in', async ({
    page,
  }) => {
    await signInWithEmail(page, E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD, '/admin/products/new')
    await page.goto('/admin/products/new')

    const title = page.getByRole('heading', { name: 'מוצר חדש' })
    const visible = await title.isVisible().catch(() => false)
    test.skip(!visible, 'admin fixture is not seeded; run pnpm seed:test')

    await expectHebrewRtl(page)

    // The two halves of the split are on screen and BOTH start empty. If either
    // ever arrives pre-filled, a default has been introduced somewhere and the
    // whole no-default rule is gone.
    const platform = page.locator('#platform_percent')
    const supplier = page.locator('#supplier_split_percent')
    await expect(platform).toHaveValue('')
    await expect(supplier).toHaveValue('')

    // `required` on the platform half means the browser refuses the submit
    // before the server is asked. That is a real part of the guard and worth
    // pinning: it is what stops an admin from discovering the refusal after a
    // round trip.
    await expect(platform).toHaveAttribute('required', '')

    await page.locator('#name_he').fill('מוצר בדיקת E2E שלא ייווצר')
    await page.getByRole('button', { name: /יצירת מוצר/ }).click()

    // Still on the form. Nothing was created, and the browser said so.
    await expect(title).toBeVisible()
    const stillEmpty = await platform.inputValue()
    expect(stillEmpty, 'an empty percent must never be filled in for the admin').toBe('')
  })

  test('typing one half of the split completes the other, always to 100', async ({ page }) => {
    await signInWithEmail(page, E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD, '/admin/products/new')
    await page.goto('/admin/products/new')

    const title = page.getByRole('heading', { name: 'מוצר חדש' })
    const visible = await title.isVisible().catch(() => false)
    test.skip(!visible, 'admin fixture is not seeded; run pnpm seed:test')

    const platform = page.locator('#platform_percent')
    const supplier = page.locator('#supplier_split_percent')

    // The pair is completed in the form and checked again by completeSplitPair
    // before the write, and the DB CHECK products_split_pair_sums_to_100 backs
    // both up. Three layers, and this is the one the admin actually sees.
    await platform.fill('30')
    await expect(supplier).toHaveValue('70')

    await supplier.fill('25')
    await expect(platform).toHaveValue('75')
  })
})
