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
  // The page registers the service worker, and a request the worker answers
  // is invisible to page.route: on WebKit the POST went to the real endpoint
  // and wrote a lead (C142). Blocked, the interception holds on every engine.
  test.use({ serviceWorkers: 'block' })

  test('the form requires the agreement, posts its fields and shows the thank-you', async ({
    page,
  }) => {
    let posted: string | null = null
    await page.route('**/api/supplier/apply', async (route) => {
      posted = route.request().postData()
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        // The route's real success shape: `{ message }`, no `ok` field.
        body: JSON.stringify({ message: 'קיבלנו את הפרטים, תודה!' }),
      })
    })

    await page.goto('/suppliers')
    // The submit handler is attached on hydration. Not `networkidle`: WebKit
    // keeps a request open on this page and never reaches it (C142).
    await page.waitForLoadState('load')
    await page.waitForFunction(() => document.readyState === 'complete')
    await page.waitForTimeout(1_000)
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
