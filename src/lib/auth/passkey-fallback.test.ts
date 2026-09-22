import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Passkey login falls back to a magic link (OTP to email), never to a password.
 *
 * The store has no password as the everyday login. Face ID / Touch ID is the
 * fast path; when the authenticator fails, `onFallback` opens the magic-link
 * form that already works. A customer whose passkey will not cooperate is one
 * tap from the way in, not a password reset.
 */

const ROOT = resolve(__dirname, '../../../')

describe('passkey login fallback', () => {
  it('wires onFallback to the magic-link form', () => {
    const form = readFileSync(resolve(ROOT, 'src/app/(auth)/login/LoginForm.tsx'), 'utf8')
    expect(form).toContain('PasskeyLoginButton')
    expect(form).toContain('onFallback={() => setShowMagic(true)}')
    expect(form).toContain('sendMagicLink')
  })

  it('opens the magic-link form when the ceremony fails', () => {
    const button = readFileSync(
      resolve(ROOT, 'src/app/(auth)/login/PasskeyLoginButton.tsx'),
      'utf8',
    )
    expect(button).toContain('onFallback()')
    expect(button).toContain('@simplewebauthn/browser')
  })
})
