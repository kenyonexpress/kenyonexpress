import { expect, test } from '@playwright/test'
import { E2E_CUSTOMER_EMAIL, E2E_CUSTOMER_PASSWORD, signInWithEmail } from './auth-session'

/**
 * C111: passkey login with a CDP virtual authenticator (Chromium only).
 *
 * Register a passkey on /account/security as the fixture customer, drop the
 * session, then sign in from /login with nothing but the passkey button. The
 * credential is removed again at the end so the fixture user stays clean.
 */
test.describe('passkey login @auth', () => {
  test.describe.configure({ timeout: 120_000 })

  test('register a passkey, sign out, sign back in with it', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'virtual authenticator is a Chromium CDP feature')

    const cdp = await page.context().newCDPSession(page)
    await cdp.send('WebAuthn.enable')
    const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', {
      options: {
        protocol: 'ctap2',
        transport: 'internal',
        hasResidentKey: true,
        hasUserVerification: true,
        isUserVerified: true,
        automaticPresenceSimulation: true,
      },
    })

    await signInWithEmail(page, E2E_CUSTOMER_EMAIL, E2E_CUSTOMER_PASSWORD, '/account/security')
    await page.goto('/account/security')
    const add = page.getByRole('button', { name: 'הוספת מפתח גישה' })
    test.skip(!(await add.isVisible().catch(() => false)), 'passkeys are switched off')
    // The authenticator holds the credential BEFORE the page posts it to the
    // server, so polling the authenticator and then clearing cookies raced the
    // `verify` POST: the server never stored the passkey and sign-in answered
    // unknown_passkey (C142). Wait for the server to accept it.
    const stored = page.waitForResponse(
      (r) =>
        r.url().includes('/api/auth/passkey/register') &&
        (r.request().postData() ?? '').includes('"verify"'),
    )
    await add.click()
    expect((await stored).status(), 'the server refused the new passkey').toBe(200)
    // With text: Next's route announcer is an always-present, empty
    // role="alert", and counting it read as a failed registration (C126/C142).
    await expect(page.getByRole('alert').filter({ hasText: /\S/ })).toHaveCount(0)
    await expect
      .poll(
        async () =>
          (await cdp.send('WebAuthn.getCredentials', { authenticatorId })).credentials.length,
      )
      .toBe(1)

    await page.context().clearCookies()
    await page.goto('/login?next=%2Faccount')
    // The login page is tabbed (LoginModal); passkey sign-in has its own tab.
    await page.getByRole('tab', { name: 'מפתח גישה' }).click()
    await page.getByRole('button', { name: 'כניסה עם מפתח גישה' }).click()
    await page.waitForURL(/\/account/, { timeout: 20_000 })
    await expect(page).not.toHaveURL(/\/login/)

    // Leave the fixture user as found: remove the credential just registered.
    await page.goto('/account/security')
    const remove = page.getByRole('button', { name: /הסרה|מחיקה/ }).first()
    if (await remove.isVisible().catch(() => false)) await remove.click()
  })
})
