import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/server/actions/auth', () => ({
  signInWithEmail: vi.fn(async () => null),
  signInWithGoogle: vi.fn(async () => null),
  sendMagicLink: vi.fn(async () => null),
  verifyEmailOtp: vi.fn(async () => null),
  sendPhoneOtp: vi.fn(async () => null),
  verifyPhoneOtp: vi.fn(async () => null),
}))
const passkeys = vi.hoisted(() => ({
  begin: vi.fn(async () => ({ options: {} })),
  finish: vi.fn(async () => ({ error: 'x' })),
}))
vi.mock('@/server/actions/passkeys', () => ({
  beginPasskeyLogin: passkeys.begin,
  finishPasskeyLogin: passkeys.finish,
}))
const webauthn = vi.hoisted(() => ({
  supported: true,
  start: vi.fn(async () => {
    throw new Error('no authenticator')
  }),
}))
vi.mock('@simplewebauthn/browser', () => ({
  browserSupportsWebAuthn: () => webauthn.supported,
  startAuthentication: webauthn.start,
}))

import LoginPanel, { nextTabForKey } from './LoginPanel'

/**
 * The shared login body (UX23): the tabs' ARIA contract and keyboard, the
 * ids that keep the page and the dialog distinct, the `next` every form
 * carries, and the passkey's fallback into the magic link.
 */

beforeEach(() => {
  document.documentElement.dir = 'rtl'
})
afterEach(() => {
  vi.clearAllMocks()
  document.documentElement.dir = ''
})

function tab(name: string) {
  return screen.getByRole('tab', { name })
}

describe('nextTabForKey', () => {
  const tabs = ['email', 'phone'] as const
  it('ArrowLeft moves forward in RTL and ArrowRight moves back', () => {
    expect(nextTabForKey('ArrowLeft', tabs, 'email', true)).toBe('phone')
    expect(nextTabForKey('ArrowRight', tabs, 'phone', true)).toBe('email')
  })
  it('is the mirror in LTR', () => {
    expect(nextTabForKey('ArrowRight', tabs, 'email', false)).toBe('phone')
    expect(nextTabForKey('ArrowLeft', tabs, 'phone', false)).toBe('email')
  })
  it('wraps at both ends, and Home / End jump', () => {
    expect(nextTabForKey('ArrowLeft', tabs, 'phone', true)).toBe('email')
    expect(nextTabForKey('ArrowRight', tabs, 'email', true)).toBe('phone')
    expect(nextTabForKey('Home', tabs, 'phone', true)).toBe('email')
    expect(nextTabForKey('End', tabs, 'email', true)).toBe('phone')
  })
  it('ignores other keys and a strip of one', () => {
    expect(nextTabForKey('Enter', tabs, 'email', true)).toBeNull()
    expect(nextTabForKey('ArrowLeft', ['email'], 'email', true)).toBeNull()
  })
})

describe('LoginPanel without an SMS provider', () => {
  it('renders the email form with no tab strip: one way to type is not a choice', () => {
    render(<LoginPanel />)
    expect(screen.queryByRole('tablist')).toBeNull()
    expect(screen.queryByRole('tabpanel')).toBeNull()
    expect(screen.getByLabelText('אימייל')).toHaveAttribute('id', 'login-email')
    expect(screen.getByLabelText('סיסמה')).toHaveAttribute('id', 'login-password')
    expect(screen.queryByText(/SMS/)).toBeNull()
  })

  it('keeps the magic-link toggle on the touch floor', () => {
    render(<LoginPanel />)
    const toggle = screen.getByRole('button', { name: /קישור מאובטח/ })
    expect(toggle.className).toContain('min-h-touch-min')
    fireEvent.click(toggle)
    expect(screen.getByLabelText('אימייל לקישור כניסה')).toHaveAttribute('id', 'login-magic-email')
  })
})

describe('LoginPanel with the SMS tab', () => {
  it('is a tablist of two tabs, email selected, the SMS panel hidden and mounted', () => {
    render(<LoginPanel phoneEnabled />)
    const list = screen.getByRole('tablist', { name: 'דרך הכניסה' })
    expect(list.getAttribute('aria-orientation')).toBe('horizontal')
    const email = tab('אימייל וסיסמה')
    const phone = tab('קוד ב-SMS')
    expect(email).toHaveAttribute('aria-selected', 'true')
    expect(phone).toHaveAttribute('aria-selected', 'false')
    // Roving tabindex: one tab stop in the strip.
    expect(email.tabIndex).toBe(0)
    expect(phone.tabIndex).toBe(-1)
    const emailPanel = document.getElementById('login-panel-email') as HTMLElement
    const phonePanel = document.getElementById('login-panel-phone') as HTMLElement
    expect(email).toHaveAttribute('aria-controls', 'login-panel-email')
    expect(phone).toHaveAttribute('aria-controls', 'login-panel-phone')
    expect(emailPanel.getAttribute('role')).toBe('tabpanel')
    expect(emailPanel.hidden).toBe(false)
    expect(phonePanel.hidden).toBe(true)
    // Hidden, not unmounted: the phone field exists behind the email tab.
    expect(document.getElementById('login-otp-phone')).not.toBeNull()
  })

  it('a press on the SMS tab shows its panel and hides the email one', () => {
    render(<LoginPanel phoneEnabled />)
    fireEvent.click(tab('קוד ב-SMS'))
    expect(tab('קוד ב-SMS')).toHaveAttribute('aria-selected', 'true')
    expect(tab('קוד ב-SMS').tabIndex).toBe(0)
    expect(tab('אימייל וסיסמה').tabIndex).toBe(-1)
    expect((document.getElementById('login-panel-phone') as HTMLElement).hidden).toBe(false)
    expect((document.getElementById('login-panel-email') as HTMLElement).hidden).toBe(true)
    expect(screen.getByLabelText('מספר טלפון נייד')).toBeVisible()
  })

  it('a number typed into the SMS tab survives a look at the email tab', () => {
    render(<LoginPanel phoneEnabled />)
    fireEvent.click(tab('קוד ב-SMS'))
    fireEvent.change(screen.getByLabelText('מספר טלפון נייד'), { target: { value: '0501234567' } })
    fireEvent.click(tab('אימייל וסיסמה'))
    fireEvent.click(tab('קוד ב-SMS'))
    expect((screen.getByLabelText('מספר טלפון נייד') as HTMLInputElement).value).toBe('0501234567')
  })

  it('follows the page direction on the arrow keys: in RTL, ArrowLeft is forward', () => {
    render(<LoginPanel phoneEnabled />)
    const list = screen.getByRole('tablist')
    tab('אימייל וסיסמה').focus()
    fireEvent.keyDown(list, { key: 'ArrowLeft' })
    expect(tab('קוד ב-SMS')).toHaveAttribute('aria-selected', 'true')
    expect(document.activeElement).toBe(tab('קוד ב-SMS'))
    fireEvent.keyDown(list, { key: 'ArrowRight' })
    expect(tab('אימייל וסיסמה')).toHaveAttribute('aria-selected', 'true')
    expect(document.activeElement).toBe(tab('אימייל וסיסמה'))
    fireEvent.keyDown(list, { key: 'End' })
    expect(tab('קוד ב-SMS')).toHaveAttribute('aria-selected', 'true')
    fireEvent.keyDown(list, { key: 'Home' })
    expect(tab('אימייל וסיסמה')).toHaveAttribute('aria-selected', 'true')
  })

  it('carries next into the Google, email and SMS forms', () => {
    render(<LoginPanel phoneEnabled next="/cart" />)
    const nexts = [...document.querySelectorAll<HTMLInputElement>('input[name="next"]')].map(
      (i) => i.value,
    )
    // Google + email now; the SMS verify step adds its own once a code is sent.
    expect(nexts).toEqual(['/cart', '/cart'])
    expect(screen.getByRole('link', { name: 'הרשמה' })).toHaveAttribute(
      'href',
      '/signup?next=%2Fcart',
    )
  })
})

describe('LoginPanel in the dialog', () => {
  it('prefixes every id so the page and the dialog never collide', () => {
    render(<LoginPanel phoneEnabled variant="dialog" />)
    expect(screen.getByLabelText('אימייל')).toHaveAttribute('id', 'login-dialog-email')
    expect(document.getElementById('login-dialog-tab-phone')).not.toBeNull()
    expect(document.getElementById('login-dialog-otp-phone')).not.toBeNull()
    expect(document.querySelector('.login-panel')?.getAttribute('data-variant')).toBe('dialog')
  })
})

describe('the passkey fallback', () => {
  it('a failed passkey opens the magic-link form on the email tab', async () => {
    render(<LoginPanel phoneEnabled />)
    // The button appears after the support check runs in an effect.
    const passkey = await screen.findByRole('button', { name: /Face ID/ })
    fireEvent.click(tab('קוד ב-SMS'))
    expect(screen.queryByLabelText('אימייל לקישור כניסה')).toBeNull()
    await act(async () => {
      fireEvent.click(passkey)
    })
    await waitFor(() => {
      expect(screen.getByLabelText('אימייל לקישור כניסה')).toBeVisible()
    })
    expect(webauthn.start).toHaveBeenCalledTimes(1)
    expect(tab('אימייל וסיסמה')).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText('הכניסה עם המפתח נכשלה, אפשר להיכנס עם קישור לאימייל')).toBeVisible()
  })
})

describe('LoginPanel inside the dialog (UX24)', () => {
  it('"הרשמה" keeps its href and switches bodies only on a plain press when the dialog asks', () => {
    const onSignup = vi.fn()
    const left: boolean[] = []
    const settle = (e: Event) => {
      left.push(!e.defaultPrevented)
      e.preventDefault()
    }
    document.addEventListener('click', settle)
    render(<LoginPanel next="/cart" variant="dialog" onSignup={onSignup} />)
    const link = screen.getByRole('link', { name: 'הרשמה' })
    expect(link).toHaveAttribute('href', '/signup?next=%2Fcart')
    fireEvent.click(link, { metaKey: true })
    expect(onSignup).not.toHaveBeenCalled()
    fireEvent.click(link)
    expect(onSignup).toHaveBeenCalledTimes(1)
    document.removeEventListener('click', settle)
    expect(left).toEqual([true, false])
  })

  it('without the callback (the /login page) the link is a plain navigation', () => {
    const left: boolean[] = []
    const settle = (e: Event) => {
      left.push(!e.defaultPrevented)
      e.preventDefault()
    }
    document.addEventListener('click', settle)
    render(<LoginPanel />)
    fireEvent.click(screen.getByRole('link', { name: 'הרשמה' }))
    document.removeEventListener('click', settle)
    expect(left).toEqual([true])
  })
})
