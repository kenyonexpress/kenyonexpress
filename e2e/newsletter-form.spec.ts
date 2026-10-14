import { expect, test } from '@playwright/test'

/**
 * UX12 (14.10.2026): THE NEWSLETTER FORM'S VALIDATION, read off the rendered
 * page. Below `lg` the form is the home card (form.ke-newsletter); from `lg`
 * it is the footer pill. Measured before (logs/ux12/before.json, all three
 * widths): an empty submit opened the browser's own bubble ("Please fill out
 * this field." in a headless Chromium) and nothing of ours; `ofir@kenyon`
 * passed the browser's `type="email"` check, made a server round trip and
 * came back "כתובת מייל לא תקינה", which stayed on screen after the visitor
 * had fixed the typing.
 *
 * Now the browser never speaks (novalidate), the page answers in Hebrew with
 * `role="alert"`, marks the field `aria-invalid` and focuses it, no request
 * leaves the page for a failing address, and the sentence clears as soon as
 * the typing passes.
 *
 * NO PASSING ADDRESS IS EVER SUBMITTED HERE. The local build may hold live
 * Supabase and Resend keys, and a passing submit writes a real pending row
 * and sends a real mail. The success state is pinned by the component tests.
 */

type Page = import('@playwright/test').Page

async function preset(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('ke_consent', JSON.stringify({ v: 1, analytics: false, marketing: false }))
  })
}

/** The one newsletter form the viewport shows: the card below lg, the pill from lg. */
async function visibleForm(page: Page) {
  const forms = page.locator('form:has(input[type="email"][name="email"])')
  for (const form of await forms.all()) if (await form.isVisible()) return form
  throw new Error('no visible newsletter form on /')
}

test.describe('newsletter form (UX12)', () => {
  test.beforeEach(async ({ page }) => {
    await preset(page)
    await page.goto('/')
  })

  test('turns the browser bubble off and keeps the address field LTR inside an RTL form', async ({
    page,
  }) => {
    const form = await visibleForm(page)
    await form.scrollIntoViewIfNeeded()
    await expect(form).toHaveJSProperty('noValidate', true)
    const input = form.locator('input[type="email"]')
    await expect(input).toHaveAttribute('dir', 'ltr')
    await expect(input).toHaveAttribute('required', '')
    await expect(input).not.toHaveAttribute('aria-invalid', /.*/)
    expect(await form.evaluate((el) => getComputedStyle(el).direction)).toBe('rtl')
    expect(await input.evaluate((el) => getComputedStyle(el).direction)).toBe('ltr')
  })

  test('answers an empty submit on the page, in Hebrew, with the field marked and focused', async ({
    page,
  }) => {
    const posts: string[] = []
    page.on('request', (req) => {
      if (req.method() === 'POST') posts.push(req.url())
    })
    const form = await visibleForm(page)
    await form.scrollIntoViewIfNeeded()
    const input = form.locator('input[type="email"]')
    await form.locator('button[type="submit"]').click()

    const alert = form.locator('xpath=..').getByRole('alert')
    await expect(alert).toHaveText(/נא להזין כתובת מייל/)
    await expect(alert).toHaveAttribute('data-kind', 'field')
    expect(await alert.evaluate((el) => getComputedStyle(el).direction)).toBe('rtl')
    await expect(input).toHaveAttribute('aria-invalid', 'true')
    await expect(input).toBeFocused()
    expect(await input.evaluate((el) => (el as HTMLInputElement).validationMessage)).not.toBe('')
    // The browser's own message exists but is never shown: ours is the one
    // the field is described by.
    const described = await input.getAttribute('aria-describedby')
    expect(described?.split(/\s+/)).toContain(await alert.getAttribute('id'))
    expect(posts, 'no request leaves the page for an empty field').toEqual([])
  })

  test('refuses the address the browser would have sent, without a request, and clears as the typing is fixed', async ({
    page,
  }) => {
    const posts: string[] = []
    page.on('request', (req) => {
      if (req.method() === 'POST') posts.push(req.url())
    })
    const form = await visibleForm(page)
    await form.scrollIntoViewIfNeeded()
    const input = form.locator('input[type="email"]')
    await input.fill('ofir@kenyon')
    await form.locator('button[type="submit"]').click()

    const alert = form.locator('xpath=..').getByRole('alert')
    await expect(alert).toHaveText(/כתובת המייל לא תקינה/)
    await expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(posts, 'a malformed address is stopped on the page').toEqual([])

    await input.fill('ofir@kenyonexpress.co.il')
    await expect(alert).toHaveCount(0)
    await expect(input).not.toHaveAttribute('aria-invalid', /.*/)
    expect(posts).toEqual([])
  })

  test('a blur on a half-typed address says what is missing; a blur on an empty field says nothing', async ({
    page,
  }) => {
    const form = await visibleForm(page)
    await form.scrollIntoViewIfNeeded()
    const input = form.locator('input[type="email"]')
    const alert = form.locator('xpath=..').getByRole('alert')

    await input.focus()
    await input.blur()
    await expect(alert).toHaveCount(0)

    await input.fill('ofir.kenyonexpress.co.il')
    await input.blur()
    await expect(alert).toHaveText(/חייבת לכלול @/)
  })
})
