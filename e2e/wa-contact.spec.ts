import { expect, test } from '@playwright/test'
import {
  CONSENT_COOKIE,
  CONSENT_WORDING_VERSION,
  serializeConsent,
} from '../src/lib/analytics/consent'

/**
 * Section 94: WhatsApp by topic. Every link is asserted as a wa.me deep link
 * carrying encoded Hebrew, not as "a button exists".
 */
const WA = /^https:\/\/wa\.me\/\d{10,15}\?text=/

test.describe('WhatsApp contact system', () => {
  test('/contact offers the five topics and each one deep-links with its own Hebrew opener', async ({
    page,
  }) => {
    await page.goto('/contact')
    const picker = page.getByTestId('contact-picker-contact_page')
    await expect(picker).toBeVisible()
    const select = picker.locator('select')
    const options = await select.locator('option').allTextContents()
    expect(options.length).toBeGreaterThanOrEqual(5)
    expect(options).toContain('שירות לקוחות')
    expect(options).toContain('הצטרפות כבית עסק')

    const link = picker.getByTestId('contact-picker-link')
    await expect(link).toHaveAttribute('href', WA)
    const before = decodeURIComponent((await link.getAttribute('href')) ?? '')
    expect(before).toContain('שירות הלקוחות')

    await select.selectOption('supplier_join')
    await expect(link).toHaveAttribute('data-channel', 'supplier_join')
    const after = decodeURIComponent((await link.getAttribute('href')) ?? '')
    expect(after).toContain('להצטרף לקניון אקספרס')
    await expect(link).toHaveAttribute('target', '_blank')
  })

  test('the floating button opens a topic sheet with the same deep links', async ({
    page,
    baseURL,
  }) => {
    // The consent banner sits over the bottom edge where the float lives, and
    // Playwright refuses a click another element would receive. A decided
    // visitor never sees it: same cookie the homepage spec sets.
    await page.context().addCookies([
      {
        name: CONSENT_COOKIE,
        value: serializeConsent({ decision: 'denied', wordingVersion: CONSENT_WORDING_VERSION }),
        domain: new URL(baseURL as string).hostname,
        path: '/',
      },
    ])
    await page.goto('/')
    const float = page.getByTestId('whatsapp-float')
    await expect(float).toBeVisible()
    await float.click()
    const sheet = page.getByTestId('whatsapp-float-sheet')
    await expect(sheet).toBeVisible()
    await expect(sheet.getByTestId('contact-picker-link')).toHaveAttribute('href', WA)
  })

  test('the footer lists the topics as plain deep links', async ({ page }) => {
    await page.goto('/about')
    const footer = page.getByTestId('footer-contact-channels')
    const links = footer.locator('a[data-channel]')
    expect(await links.count()).toBeGreaterThanOrEqual(5)
    for (const href of await links.evaluateAll((els) =>
      els.map((e) => e.getAttribute('href') ?? ''),
    )) {
      expect(href).toMatch(WA)
    }
  })

  test('a product page has an "ask" link that names the product, falling back to customer service', async ({
    page,
  }) => {
    await page.goto('/products')
    const first = page.locator('a[href^="/product/"]').first()
    await expect(first).toBeVisible()
    await first.click()
    await page.waitForURL(/\/product\//)
    const heading = (await page.locator('h1').first().innerText()).trim()
    const ask = page.getByTestId('ask-business')
    await expect(ask).toHaveAttribute('href', WA)
    const via = await ask.getAttribute('data-via')
    expect(['supplier', 'customer_service']).toContain(via)
    const text = decodeURIComponent((await ask.getAttribute('href')) ?? '')
    expect(text).toContain(heading.slice(0, 12))
  })
})
