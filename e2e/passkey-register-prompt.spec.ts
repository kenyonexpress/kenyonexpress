import { type Page, expect, test } from '@playwright/test'
import { E2E_CUSTOMER_EMAIL, E2E_CUSTOMER_PASSWORD, signInWithEmail } from './auth-session'

/**
 * The passkey-registration nudge on /account (PasskeyRegisterPrompt),
 * mounted from `AccountSideNav` in src/app/(account)/layout.tsx.
 *
 * NO VIRTUAL WEBAUTHN AUTHENTICATOR IS WIRED INTO THIS SUITE. Checked
 * playwright.config.ts: no `use.contextOptions` or CDP virtual-authenticator
 * setup exists anywhere in it, so a full begin -> startRegistration -> finish
 * ceremony cannot run headless here. A full happy-path test is therefore out
 * of scope, same call the task that added this file made.
 *
 * What IS realistic to pin, and headless Chromium answers it honestly
 * because `browserSupportsWebAuthn()` only checks for the `PublicKeyCredential`
 * constructor (see the browserSupportsWebAuthn helper in the
 * @simplewebauthn/browser package), which Chromium defines on any secure context
 * including plain http://localhost, with or without a real authenticator
 * behind it: the prompt renders for a signed-in customer with no passkeys,
 * its Hebrew copy and both actions are present, and dismissing it via
 * "לא עכשיו" persists across a reload through the localStorage seen-flag.
 */

async function signInOrSkip(page: Page): Promise<void> {
  try {
    await signInWithEmail(page, E2E_CUSTOMER_EMAIL, E2E_CUSTOMER_PASSWORD)
  } catch {
    test.skip(true, 'e2e customer fixture missing; run pnpm seed:test')
  }
}

function prompt(page: Page) {
  return page.getByRole('dialog', { name: 'כניסה מהירה בלי סיסמה' })
}

test.describe('Passkey registration prompt', () => {
  test('renders on /account for a signed-in customer with no passkeys', async ({ page }) => {
    await signInOrSkip(page)
    await page.goto('/account')

    const dialog = prompt(page)
    await expect(dialog).toBeVisible()
    await expect(dialog.getByText(/מפתח כניסה \(Passkey\)/)).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'הרשמה' })).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'לא עכשיו' })).toBeVisible()
  })

  test('"לא עכשיו" dismisses it and it does not reappear after a reload', async ({ page }) => {
    await signInOrSkip(page)
    await page.goto('/account')

    const dialog = prompt(page)
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: 'לא עכשיו' }).click()
    await expect(dialog).toBeHidden()

    await page.reload()
    await expect(prompt(page)).toBeHidden()
  })
})
