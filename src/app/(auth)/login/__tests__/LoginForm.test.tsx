import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import LoginForm from '../LoginForm'

vi.mock('@/server/actions/auth', () => ({
  sendMagicLink: vi.fn(async () => null),
  signInWithGoogle: vi.fn(async () => null),
}))
vi.mock('@/components/auth/PasskeySignIn', () => ({ default: () => null }))
vi.mock('@/components/auth/WhatsappOtpForm', () => ({ default: () => null }))
vi.mock('@/components/shared/TurnstileWidget', () => ({ default: () => null }))
vi.mock('../PhoneOtpForm', () => ({ default: () => null }))

/**
 * A SUCCESSFUL EMAIL SIGN-IN NAVIGATES.
 *
 * The route delegates to the server action, which ends in redirect(). A route
 * handler answers that with a 303, and fetch follows it, so the success the
 * form receives is the destination page and not JSON. The form used to parse
 * it, throw, show "שגיאת רשת" and stay on /login (C151).
 */
describe('LoginForm email sign-in', () => {
  const originalLocation = window.location

  beforeEach(() => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...originalLocation, href: 'http://localhost/login' },
    })
  })

  afterEach(() => {
    Object.defineProperty(window, 'location', { configurable: true, value: originalLocation })
    vi.unstubAllGlobals()
  })

  function submit() {
    render(<LoginForm />)
    fireEvent.change(screen.getByRole('textbox', { name: 'אימייל' }), {
      target: { value: 'a@b.co' },
    })
    fireEvent.change(screen.getByLabelText('סיסמה'), { target: { value: 'secret123' } })
    fireEvent.click(screen.getByRole('button', { name: 'כניסה' }))
  }

  it('follows the redirect the route answered with, without a network error', async () => {
    const json = vi.fn(async () => {
      throw new SyntaxError('Unexpected token <')
    })
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, redirected: true, url: 'http://localhost/account', json })),
    )

    submit()

    await waitFor(() => expect(window.location.href).toBe('http://localhost/account'))
    expect(json).not.toHaveBeenCalled()
    expect(screen.queryByText('שגיאת רשת')).toBeNull()
  })

  it('still shows the error a refused sign-in returns as JSON', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        redirected: false,
        url: 'http://localhost/api/auth/login',
        json: async () => ({ error: 'פרטי ההתחברות שגויים' }),
      })),
    )

    submit()

    expect(await screen.findByText('פרטי ההתחברות שגויים')).toBeTruthy()
    expect(window.location.href).toBe('http://localhost/login')
  })
})
