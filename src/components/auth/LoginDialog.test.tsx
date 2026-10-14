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
vi.mock('@/server/actions/passkeys', () => ({
  beginPasskeyLogin: vi.fn(async () => ({ error: 'x' })),
  finishPasskeyLogin: vi.fn(async () => ({ error: 'x' })),
}))
vi.mock('@simplewebauthn/browser', () => ({
  browserSupportsWebAuthn: () => false,
  startAuthentication: vi.fn(),
}))
const session = vi.hoisted(() => ({ id: null as string | null }))
vi.mock('@/server/actions/session', () => ({
  currentUserId: async () => session.id,
}))
const nav = vi.hoisted(() => ({ pathname: '/products' }))
vi.mock('next/navigation', () => ({ usePathname: () => nav.pathname }))

import LoginDialog from './LoginDialog'
import type { LoginDialogRequest } from './useLoginDialogRequest'

/**
 * The login dialog's modal contract (UX23): open for the request it is
 * given, `next` into every form, Escape / overlay / close button, the focus
 * trap and the restore to the opener, the body lock, the close on
 * navigation, a reopen on the next request, and the signed-in answer.
 *
 * jsdom has no layout, so `getClientRects()` is stubbed to one rect the way
 * MobileDrawer.test does; the trap's visibility filter is exercised by the
 * e2e walk.
 */

const rects = vi.spyOn(Element.prototype, 'getClientRects')

beforeEach(() => {
  rects.mockImplementation(() => [{}] as unknown as DOMRectList)
  session.id = null
  nav.pathname = '/products'
})
afterEach(() => {
  rects.mockReset()
  document.body.className = ''
})

function opener() {
  const button = document.createElement('button')
  button.textContent = 'התחברות'
  document.body.appendChild(button)
  button.focus()
  return button
}

function request(over: Partial<LoginDialogRequest> = {}): LoginDialogRequest {
  return { seq: 1, next: '/products?page=2', opener: null, pathname: '/products', ...over }
}

describe('LoginDialog', () => {
  it('opens for the request with the title, the modal mark, the lock and next in the forms', () => {
    render(<LoginDialog request={request({ next: '/cart' })} />)
    const dialog = screen.getByRole('dialog', { name: 'כניסה לחשבון' })
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(document.body.classList.contains('login-dialog-open')).toBe(true)
    expect(screen.getByRole('heading', { level: 2, name: 'כניסה לחשבון' })).toBeVisible()
    const nexts = [...document.querySelectorAll<HTMLInputElement>('input[name="next"]')].map(
      (i) => i.value,
    )
    expect(nexts).toEqual(['/cart', '/cart'])
    // The ids are the dialog's, not the page's.
    expect(screen.getByLabelText('אימייל')).toHaveAttribute('id', 'login-dialog-email')
  })

  it('moves focus onto the labelled panel and gives it back to the opener on Escape', () => {
    const trigger = opener()
    render(<LoginDialog request={request({ opener: trigger })} />)
    const dialog = screen.getByRole('dialog')
    expect(document.activeElement).toBe(dialog)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.body.classList.contains('login-dialog-open')).toBe(false)
    expect(document.activeElement).toBe(trigger)
    trigger.remove()
  })

  it('closes on the close button, and a new request reopens it', () => {
    const { rerender } = render(<LoginDialog request={request()} />)
    fireEvent.click(screen.getByRole('button', { name: 'סגירה' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    rerender(<LoginDialog request={request({ seq: 2, next: '/gift/abc' })} />)
    expect(screen.getByRole('dialog')).toBeVisible()
    expect((document.querySelector('input[name="next"]') as HTMLInputElement).value).toBe(
      '/gift/abc',
    )
  })

  it('closes on the overlay', () => {
    render(<LoginDialog request={request()} />)
    fireEvent.click(screen.getByRole('button', { name: 'סגירת חלון הכניסה' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('wraps Tab inside the panel in both directions and pulls an escaped focus back', () => {
    render(<LoginDialog request={request()} />)
    const dialog = screen.getByRole('dialog')
    const focusables = [
      ...dialog.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    ]
    const first = focusables[0] as HTMLElement
    const last = focusables[focusables.length - 1] as HTMLElement
    // Shift+Tab from the panel itself (where focus lands) goes to the last control.
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(last)
    fireEvent.keyDown(document, { key: 'Tab' })
    expect(document.activeElement).toBe(first)
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(last)
    // Focus that got out is pulled back in.
    const outside = opener()
    fireEvent.keyDown(document, { key: 'Tab' })
    expect(document.activeElement).toBe(first)
    outside.remove()
  })

  it('closes itself when the route changes under it', () => {
    const { rerender } = render(<LoginDialog request={request()} />)
    expect(screen.getByRole('dialog')).toBeVisible()
    nav.pathname = '/account'
    rerender(<LoginDialog request={request()} />)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('shows the way to the account instead of the form when already signed in', async () => {
    session.id = 'user-1'
    render(<LoginDialog request={request()} />)
    await waitFor(() => {
      expect(screen.getByTestId('login-dialog-signed-in')).toBeVisible()
    })
    expect(screen.getByRole('link', { name: 'לאזור האישי' })).toHaveAttribute('href', '/account')
    expect(screen.queryByLabelText('אימייל')).toBeNull()
  })

  it('renders the SMS tab only when the shell says a provider is wired', () => {
    render(<LoginDialog request={request()} phoneEnabled />)
    expect(screen.getByRole('tab', { name: 'קוד ב-SMS' })).toBeVisible()
    act(() => {
      fireEvent.click(screen.getByRole('tab', { name: 'קוד ב-SMS' }))
    })
    expect(document.getElementById('login-dialog-otp-phone')).not.toBeNull()
  })
})
