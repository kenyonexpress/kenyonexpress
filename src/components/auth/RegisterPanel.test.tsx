import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type Action = (...args: unknown[]) => Promise<unknown>
const actions = vi.hoisted(() => ({
  register: vi.fn<Action>(async () => null),
  verify: vi.fn<Action>(async () => null),
  resend: vi.fn<Action>(async () => null),
  google: vi.fn<Action>(async () => null),
}))
vi.mock('@/server/actions/register', () => ({
  registerAccount: (...a: unknown[]) => actions.register(...a),
  verifyRegisterPhone: (...a: unknown[]) => actions.verify(...a),
}))
vi.mock('@/server/actions/signup-phone', () => ({
  resendSignupPhoneOtp: (...a: unknown[]) => actions.resend(...a),
}))
vi.mock('@/server/actions/auth', () => ({
  signInWithGoogle: (...a: unknown[]) => actions.google(...a),
}))

import RegisterPanel from './RegisterPanel'

/**
 * The register stepper (UX24): four steps in an <ol> with one aria-current,
 * step one advancing on the client with the server's own sentences and no
 * request, the typed values surviving a trip back, the terms box required
 * before any request, the whole form posted at step two, a server field
 * error returning to its step, the code step with the masked number and
 * its skip, the welcome with the mark and the mail's address, and the ids
 * that keep the page and the dialog distinct.
 */

const rects = vi.spyOn(Element.prototype, 'getClientRects')

beforeEach(() => {
  document.documentElement.dir = 'rtl'
  rects.mockImplementation(() => [{}] as unknown as DOMRectList)
  actions.register.mockReset().mockResolvedValue(null)
  actions.verify.mockReset().mockResolvedValue(null)
})
afterEach(() => rects.mockReset())

function steps() {
  return [...screen.getByRole('list', { name: 'שלבי ההרשמה' }).querySelectorAll('li')].map(
    (li) => `${li.dataset.state}${li.getAttribute('aria-current') === 'step' ? '*' : ''}`,
  )
}

function fillDetails(over: Partial<Record<'name' | 'email' | 'password', string>> = {}) {
  fireEvent.change(screen.getByLabelText('שם מלא'), {
    target: { value: over.name ?? 'דנה כהן' },
  })
  fireEvent.change(screen.getByLabelText('אימייל'), {
    target: { value: over.email ?? 'dana@example.com' },
  })
  fireEvent.change(screen.getByLabelText('סיסמה'), {
    target: { value: over.password ?? 'secret12' },
  })
}

function advance() {
  fireEvent.click(screen.getByRole('button', { name: 'המשך' }))
}

describe('RegisterPanel', () => {
  it('opens on step one: the stepper, Google, three fields, no phone, the login link', () => {
    render(<RegisterPanel next="/cart" />)
    expect(steps()).toEqual(['current*', 'upcoming', 'upcoming', 'upcoming'])
    expect(screen.getByRole('button', { name: /הרשמה עם Google/ })).toBeVisible()
    expect(screen.getByLabelText('שם מלא')).toHaveAttribute('id', 'register-full_name')
    expect(screen.getByLabelText('אימייל')).toBeVisible()
    expect(screen.getByLabelText('סיסמה')).toBeVisible()
    expect(screen.getByLabelText('טלפון נייד')).not.toBeVisible()
    expect(screen.getByRole('link', { name: 'כניסה' })).toHaveAttribute(
      'href',
      '/login?next=%2Fcart',
    )
    expect(screen.getByRole('status')).toHaveTextContent('שלב 1 מתוך 4: פרטים')
  })

  it('refuses step one with the server’s sentences and sends no request', () => {
    render(<RegisterPanel />)
    fillDetails({ name: 'a', email: 'nope', password: 'short' })
    advance()
    expect(screen.getByText('שם מלא חייב להכיל לפחות 2 תווים')).toBeVisible()
    expect(screen.getByText('כתובת אימייל לא תקינה')).toBeVisible()
    expect(screen.getByText('הסיסמה חייבת להכיל לפחות 8 תווים')).toBeVisible()
    expect(screen.getByLabelText('שם מלא')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByLabelText('שם מלא')).toHaveFocus()
    expect(steps()[0]).toBe('current*')
    expect(actions.register).not.toHaveBeenCalled()
  })

  it('advances to the phone step on valid details, focuses its heading, and keeps the values on the way back', () => {
    render(<RegisterPanel />)
    fillDetails()
    advance()
    expect(steps()).toEqual(['done', 'current*', 'upcoming', 'upcoming'])
    expect(screen.getByRole('heading', { level: 3, name: 'טלפון ותנאים' })).toHaveFocus()
    expect(screen.getByLabelText('טלפון נייד')).toBeVisible()
    expect(screen.getByLabelText(/קראתי ואני מאשר/)).not.toBeChecked()
    expect(screen.getByLabelText('שם מלא')).not.toBeVisible()
    expect(screen.getByRole('status')).toHaveTextContent('שלב 2 מתוך 4: טלפון ותנאים')
    fireEvent.click(screen.getByRole('button', { name: 'חזרה לפרטים' }))
    expect(steps()[0]).toBe('current*')
    expect(screen.getByLabelText('שם מלא')).toHaveValue('דנה כהן')
    expect(screen.getByLabelText('אימייל')).toHaveValue('dana@example.com')
  })

  it('links the terms and the privacy policy in a new tab, and refuses an unticked box before any request', () => {
    render(<RegisterPanel />)
    fillDetails()
    advance()
    const links = screen.getByLabelText(/קראתי ואני מאשר/).closest('.register-terms')
    const hrefs = [...(links?.querySelectorAll('a') ?? [])].map((a) => [
      a.getAttribute('href'),
      a.getAttribute('target'),
    ])
    expect(hrefs).toEqual([
      ['/terms-and-conditions', '_blank'],
      ['/privacy-policy', '_blank'],
    ])
    fireEvent.change(screen.getByLabelText('טלפון נייד'), { target: { value: '050-1234567' } })
    fireEvent.click(screen.getByRole('button', { name: 'יצירת חשבון' }))
    expect(screen.getByRole('alert')).toHaveTextContent(
      'כדי להירשם יש לאשר את תנאי השימוש ומדיניות הפרטיות',
    )
    expect(screen.getByLabelText(/קראתי ואני מאשר/)).toHaveAttribute('aria-invalid', 'true')
    expect(actions.register).not.toHaveBeenCalled()
  })

  it('posts the whole form once the box is ticked and lands on the welcome when no code went out', async () => {
    actions.register.mockResolvedValue({
      step: 'welcome',
      phoneVerified: false,
      email: 'dana@example.com',
      next: null,
    })
    render(<RegisterPanel next="/cart" />)
    fillDetails()
    advance()
    fireEvent.change(screen.getByLabelText('טלפון נייד'), { target: { value: '050-1234567' } })
    fireEvent.click(screen.getByLabelText(/קראתי ואני מאשר/))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'יצירת חשבון' }))
    })
    await waitFor(() => expect(actions.register).toHaveBeenCalledTimes(1))
    const fd = actions.register.mock.calls[0]?.[1] as FormData
    expect(Object.fromEntries(fd.entries())).toEqual({
      next: '/cart',
      full_name: 'דנה כהן',
      email: 'dana@example.com',
      password: 'secret12',
      phone: '050-1234567',
      accept_terms: 'on',
    })
    await waitFor(() => expect(screen.getByTestId('register-welcome')).toBeVisible())
    expect(steps()).toEqual(['done', 'done', 'skipped', 'current*'])
    expect(screen.getByRole('heading', { level: 3, name: 'ברוכים הבאים, דנה!' })).toHaveFocus()
    expect(
      screen.getByTestId('register-welcome').querySelector('svg.register-welcome__mark'),
    ).not.toBeNull()
    expect(screen.getByText('dana@example.com')).toBeVisible()
    expect(screen.getByText(/אפשר לאמת את מספר הטלפון אחר כך/)).toBeVisible()
    // The page variant's way onward is a link to next.
    expect(screen.getByRole('link', { name: 'המשך לגלוש' })).toHaveAttribute('href', '/cart')
  })

  it('returns to the step whose field the server refused', async () => {
    actions.register.mockResolvedValue({ error: 'כתובת האימייל כבר רשומה במערכת', field: 'email' })
    render(<RegisterPanel />)
    fillDetails()
    advance()
    fireEvent.change(screen.getByLabelText('טלפון נייד'), { target: { value: '050-1234567' } })
    fireEvent.click(screen.getByLabelText(/קראתי ואני מאשר/))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'יצירת חשבון' }))
    })
    await waitFor(() => expect(steps()[0]).toBe('current*'))
    expect(screen.getByText('כתובת האימייל כבר רשומה במערכת')).toBeVisible()
    expect(screen.getByLabelText('אימייל')).toBeVisible()
  })

  it('shows the code step with the masked number when a code went out, verifies, and can be skipped', async () => {
    actions.register.mockResolvedValue({
      step: 'verify',
      phone: '+972501234567',
      email: 'dana@example.com',
      next: null,
    })
    actions.verify.mockResolvedValue({
      step: 'welcome',
      phoneVerified: true,
      email: 'dana@example.com',
      next: null,
    })
    render(<RegisterPanel variant="dialog" onDone={() => {}} />)
    fillDetails()
    advance()
    fireEvent.change(screen.getByLabelText('טלפון נייד'), { target: { value: '050-1234567' } })
    fireEvent.click(screen.getByLabelText(/קראתי ואני מאשר/))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'יצירת חשבון' }))
    })
    await waitFor(() => expect(steps()).toEqual(['done', 'done', 'current*', 'upcoming']))
    expect(screen.getByText(/שלחנו קוד בן 6 ספרות/)).toBeVisible()
    expect(screen.getByText('+9725*****567')).toBeVisible()
    const code = screen.getByLabelText('קוד האימות')
    expect(code).toHaveAttribute('id', 'register-dialog-otp')
    expect(screen.getByRole('button', { name: /דלגו בינתיים/ })).toBeVisible()
    fireEvent.change(code, { target: { value: '123456' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'אימות' }))
    })
    await waitFor(() => expect(actions.verify).toHaveBeenCalledTimes(1))
    const fd = actions.verify.mock.calls[0]?.[1] as FormData
    expect(Object.fromEntries(fd.entries())).toEqual({
      phone: '+972501234567',
      email: 'dana@example.com',
      token: '123456',
    })
    await waitFor(() => expect(steps()).toEqual(['done', 'done', 'done', 'current*']))
    expect(screen.getByText('מספר הטלפון אומת בהצלחה')).toBeVisible()
    // The dialog variant's way onward is a button, not a link.
    expect(screen.getByRole('button', { name: 'המשך לגלוש' })).toBeVisible()
  })

  it('skips the code step on request and marks it so', async () => {
    actions.register.mockResolvedValue({
      step: 'verify',
      phone: '+972501234567',
      email: 'dana@example.com',
      next: null,
    })
    render(<RegisterPanel />)
    fillDetails()
    advance()
    fireEvent.change(screen.getByLabelText('טלפון נייד'), { target: { value: '050-1234567' } })
    fireEvent.click(screen.getByLabelText(/קראתי ואני מאשר/))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'יצירת חשבון' }))
    })
    await waitFor(() => expect(steps()[2]).toBe('current*'))
    fireEvent.click(screen.getByRole('button', { name: /דלגו בינתיים/ }))
    expect(steps()).toEqual(['done', 'done', 'skipped', 'current*'])
  })

  it('in the dialog, "כניסה" switches bodies in place and keeps its href for a modified press', () => {
    const onLogin = vi.fn()
    render(<RegisterPanel variant="dialog" onLogin={onLogin} next="/cart" />)
    const link = screen.getByRole('link', { name: 'כניסה' })
    expect(link).toHaveAttribute('href', '/login?next=%2Fcart')
    // jsdom cannot navigate: record whether the link left the default alone,
    // then stop the attempt (the pattern LoginLink.test uses).
    const left: boolean[] = []
    const settle = (e: Event) => {
      left.push(!e.defaultPrevented)
      e.preventDefault()
    }
    document.addEventListener('click', settle)
    fireEvent.click(link, { metaKey: true })
    expect(onLogin).not.toHaveBeenCalled()
    fireEvent.click(link)
    expect(onLogin).toHaveBeenCalledTimes(1)
    document.removeEventListener('click', settle)
    expect(left).toEqual([true, false])
  })
})
