import { expect, test } from '@playwright/test'

/**
 * UX26: the 500 page and the public status page on a built server.
 *
 * Before (logs/ux26/before.json) a Server Component that threw rendered a
 * bare page with no chrome, no status check and no way to reach a person,
 * and /status was a 404. Now the storefront's error renders inside the shell
 * with the health verdict, the status link and the WhatsApp support button,
 * and /status is a static shell that reads /api/ready from the browser.
 *
 * The two throw routes are behind SENTRY_DEBUG_ROUTES (404 by default): the
 * cases that need them skip, with the reason, on a server without the gate.
 */

const THROW = {
  root: '/debug/sentry/render',
  store: '/debug/sentry/store-render',
} as const

test.describe('500 page and /status (UX26)', () => {
  test.beforeEach(async ({ context }) => {
    await context.addCookies([
      { name: 'ke_consent', value: 'denied.2', domain: 'localhost', path: '/' },
    ])
  })

  test('/status is a public static page that reads the readiness report from the browser', async ({
    page,
    request,
  }) => {
    const raw = await request.get('/status')
    expect(raw.status()).toBe(200)
    expect(await raw.text()).toContain('<meta name="robots" content="noindex')

    await page.goto('/status')
    await expect(page.getByRole('heading', { level: 1, name: 'מצב המערכת' })).toBeVisible()
    await expect(page.locator('main')).toHaveCount(1)
    await expect(page.locator('main')).toHaveAttribute('dir', 'rtl')

    const panel = page.locator('[data-status-panel]')
    await expect(panel).toHaveAttribute('data-state', /^(ok|degraded)$/, { timeout: 30_000 })
    await expect(panel.locator('[data-status-check]')).toHaveCount(5)
    await expect(panel.locator('[data-status-checked]')).toContainText('נבדק לאחרונה')

    const refresh = panel.getByRole('button', { name: /בדקו שוב|בודקים/ })
    expect((await refresh.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44)
    const nav = page.getByRole('navigation', { name: 'דרכים להמשיך' })
    await expect(nav.getByRole('link', { name: 'לדף הבית' })).toHaveAttribute('href', '/')
    await expect(nav.locator('a[href^="https://wa.me/"]')).toHaveCount(1)
  })

  for (const [kind, path] of Object.entries(THROW)) {
    test(`a render error under the ${kind} boundary shows the status check, the status link and the support button`, async ({
      page,
      request,
    }) => {
      const probe = await request.get(path)
      test.skip(probe.status() === 404, 'SENTRY_DEBUG_ROUTES is off on this server')

      await page.goto(path)
      // The route calls notFound() behind a Suspense boundary after
      // connection(), so with SENTRY_DEBUG_ROUTES off the shell streams with
      // a 200 and the not-found page renders inside it (measured 15.10.2026,
      // XF04); the status probe above cannot see that, the heading can.
      const notFoundShown = await page
        .getByRole('heading', { level: 1, name: 'הדף שחיפשתם לא נמצא' })
        .isVisible()
        .catch(() => false)
      test.skip(notFoundShown, 'SENTRY_DEBUG_ROUTES is off on this server (not-found rendered)')
      await expect(page.getByRole('heading', { level: 1, name: 'משהו השתבש אצלנו' })).toBeVisible()
      await expect(page).toHaveTitle(/משהו השתבש/)
      await expect(page.locator('main')).toHaveCount(1)
      await expect(page.locator('main [data-error]')).toHaveAttribute('dir', 'rtl')
      await expect(page.locator('[data-error-mark]')).toBeVisible()

      if (kind === 'store') {
        // Inside the shell: the header and the footer once each.
        await expect(page.locator('header')).toHaveCount(1)
        await expect(page.locator('footer')).toHaveCount(1)
        await expect(page.locator('a[href="#main-content"]')).toHaveCount(1)
      }

      const status = page.locator('[data-error-status]')
      await expect(status).toHaveAttribute('data-state', /^(ok|degraded|unknown)$/, {
        timeout: 15_000,
      })
      await expect(status.getByRole('link', { name: 'לדף מצב המערכת' })).toHaveAttribute(
        'href',
        '/status',
      )

      const support = page.locator('[data-error-support]')
      await expect(support).toHaveAttribute('href', /^https:\/\/wa\.me\/\d+\?text=/)
      const digest = await page.locator('[data-error-digest] code').textContent()
      expect(digest ?? '').toMatch(/\S/)
      await expect(support).toHaveAttribute('href', new RegExp(encodeURIComponent(digest ?? '')))

      const nav = page.getByRole('navigation', { name: 'דרכים להמשיך' })
      for (const control of [
        nav.getByRole('button', { name: 'נסו שוב' }),
        nav.getByRole('link', { name: 'לדף הבית' }),
        support,
        page.getByRole('link', { name: 'טופס יצירת קשר' }),
      ]) {
        expect((await control.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44)
      }
    })
  }
})
