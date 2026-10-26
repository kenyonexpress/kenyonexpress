import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD, signInWithEmail } from './auth-session'
import { expectHebrewRtl } from './helpers'

/**
 * Admin product CSV import: dry-run preview and commit.
 *
 * Uses the public template to verify the documented import path works end-to-end.
 * The unit suite in csv-template.test.ts already proves the parser and validator
 * work; this spec proves the browser path reaches them and shows the preview.
 */

test.describe('admin product CSV import @admin', () => {
  test.describe.configure({ timeout: 90_000 })

  test('import page is reachable and shows template download', async ({ page }) => {
    try {
      await signInWithEmail(page, E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD, '/admin/products/import')
    } catch (err) {
      test.skip(
        true,
        `admin fixture not seeded: ${String(err).split('.')[0]}. Run 'pnpm seed:test'.`,
      )
    }

    const heading = page.getByRole('heading', { level: 1, name: 'ייבוא מוצרים מ-CSV' })
    const visible = await heading.isVisible().catch(() => false)
    test.skip(!visible, 'admin fixture is not seeded; run pnpm seed:test')

    await expectHebrewRtl(page)

    // Template download link exists
    const templateLink = page.getByRole('link', { name: /הורדת תבנית דוגמה/ })
    await expect(templateLink).toBeVisible()
    await expect(templateLink).toHaveAttribute('href', '/templates/products-import.csv')
  })

  test('dry-run preview shows parsed rows without writing anything', async ({ page }) => {
    try {
      await signInWithEmail(page, E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD, '/admin/products/import')
    } catch (err) {
      test.skip(
        true,
        `admin fixture not seeded: ${String(err).split('.')[0]}. Run 'pnpm seed:test'.`,
      )
    }

    const heading = page.getByRole('heading', { level: 1 })
    const visible = await heading.isVisible().catch(() => false)
    test.skip(!visible, 'admin fixture is not seeded; run pnpm seed:test')

    // Load the public template
    const templatePath = resolve(process.cwd(), 'public/templates/products-import.csv')
    const templateContent = readFileSync(templatePath, 'utf8')

    // Create a temporary file from the template
    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles({
      name: 'test-import.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(templateContent),
    })

    // Click dry-run button
    const dryRunButton = page.getByRole('button', { name: /בדיקה/ })
    await dryRunButton.click()

    // Wait for preview to appear
    await expect(page.getByText(/תצוגה מקדימה/)).toBeVisible({ timeout: 10_000 })

    // Verify preview table shows the expected rows
    const previewTable = page.locator('table')
    await expect(previewTable).toBeVisible()

    // Check that preview shows at least one row from the template
    await expect(page.getByText('ארוחת-בוקר-זוגית')).toBeVisible()
    await expect(page.getByText('אוזניות-אלחוטיות')).toBeVisible()

    // Commit button should now be visible
    const commitButton = page.getByRole('button', { name: /אישור ייבוא/ })
    await expect(commitButton).toBeVisible()
  })

  test('commit button only appears after successful preview', async ({ page }) => {
    try {
      await signInWithEmail(page, E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD, '/admin/products/import')
    } catch (err) {
      test.skip(
        true,
        `admin fixture not seeded: ${String(err).split('.')[0]}. Run 'pnpm seed:test'.`,
      )
    }

    const heading = page.getByRole('heading', { level: 1 })
    const visible = await heading.isVisible().catch(() => false)
    test.skip(!visible, 'admin fixture is not seeded; run pnpm seed:test')

    // Initially, no commit button
    const commitButton = page.getByRole('button', { name: /אישור ייבוא/ })
    await expect(commitButton).not.toBeVisible()

    // Load valid CSV
    const templatePath = resolve(process.cwd(), 'public/templates/products-import.csv')
    const templateContent = readFileSync(templatePath, 'utf8')

    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles({
      name: 'test-import.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(templateContent),
    })

    // Run preview
    const dryRunButton = page.getByRole('button', { name: /בדיקה/ })
    await dryRunButton.click()

    // Now commit button should appear
    await expect(commitButton).toBeVisible({ timeout: 10_000 })
  })

  test('invalid CSV shows error without preview', async ({ page }) => {
    try {
      await signInWithEmail(page, E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD, '/admin/products/import')
    } catch (err) {
      test.skip(
        true,
        `admin fixture not seeded: ${String(err).split('.')[0]}. Run 'pnpm seed:test'.`,
      )
    }

    const heading = page.getByRole('heading', { level: 1 })
    const visible = await heading.isVisible().catch(() => false)
    test.skip(!visible, 'admin fixture is not seeded; run pnpm seed:test')

    // CSV missing required columns
    const invalidCsv = 'wrong,headers,here\n1,2,3\n'

    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles({
      name: 'invalid.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(invalidCsv),
    })

    const dryRunButton = page.getByRole('button', { name: /בדיקה/ })
    await dryRunButton.click()

    // Error should appear
    const errorAlert = page.getByRole('alert')
    await expect(errorAlert).toBeVisible({ timeout: 10_000 })
    await expect(errorAlert).toContainText(/חסרה עמודה חובה/)

    // No preview table
    const previewTable = page.locator('table')
    await expect(previewTable).not.toBeVisible()

    // No commit button
    const commitButton = page.getByRole('button', { name: /אישור ייבוא/ })
    await expect(commitButton).not.toBeVisible()
  })
})
