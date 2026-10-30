import { expect, test } from '@playwright/test'
import { expectHebrewRtl } from './helpers'

/**
 * C111: the supplier application on /suppliers.
 *
 * The POST is intercepted. The real endpoint writes a lead, mails the team and
 * is limited to 2 per 24h per IP, and a test must not do any of those against
 * a shared database. What is pinned is the browser half: the agreement is
 * required, the form posts every field the route reads, and a success reply
 * replaces the form with the thank-you.
 */
test.describe('supplier apply @supplier', () => {
  test('the form requires the agreement, posts its fields and shows the thank-you', async ({
    page,
  }) => {
    let posted: string | null = null
    await page.route('**/api/supplier/apply', async (route) => {
      posted = route.request().postData()
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, message: 'קיבלנו את הפרטים, תודה!' }),
      })
    })

    await page.goto('/suppliers')
    await page.waitForLoadState('networkidle') // the submit handler is attached on hydration
    await expectHebrewRtl(page)

    await page.locator('#lead-business').fill('עסק בדיקה E2E')
    await page.locator('#lead-contact').fill('בודק אוטומטי')
    await page.locator('#lead-phone').fill('0521234567')
    await page.locator('#lead-email').fill('e2e-apply@test.kenyonexpress.local')
    await page.locator('#lead-city').fill('תל אביב')

    const submit = page.getByRole('button', { name: 'שליחת פרטים' })
    await submit.click()
    expect(posted, 'the browser must refuse a submit without the agreement').toBeNull()

    await page.locator('input[name="agreement"]').check()
    await submit.click()
    await expect(page.getByText('קיבלנו את הפרטים, תודה!')).toBeVisible()

    expect(posted).toContain('business_name')
    expect(posted).toContain('agreement_hash')
  })
})
