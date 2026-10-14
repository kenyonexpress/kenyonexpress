import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * UX12: the handheld newsletter card's five states, through a mocked
 * `useActionState` (the action itself is the server's and is tested in
 * server/actions/newsletter-actions.test.ts). Pinned here: the browser never
 * speaks (noValidate), an empty or malformed submit is stopped on the page
 * with a Hebrew alert, `aria-invalid` and focus, the error clears as the
 * visitor fixes the typing, a server failure is shown without blaming the
 * field and retires on the next keystroke, pending disables the button, and
 * success replaces the form with one status card that names the inbox.
 *
 * A submit that passes the check is NOT asserted to call the action: under
 * React's form action a `fireEvent.submit` never runs it (the project's
 * recorded trap), so the passing case asserts no alert and no aria-invalid.
 */

const mock = vi.hoisted(() => ({
  state: { ok: false } as { ok: boolean; message?: string; error?: string; field?: 'email' },
  pending: false,
  action: vi.fn(),
}))

vi.mock('@/server/actions/newsletter', () => ({ subscribeToNewsletter: vi.fn() }))
vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react')
  return {
    ...actual,
    useActionState: () => [mock.state, mock.action, mock.pending],
  }
})

import NewsletterSignup from './NewsletterSignup'

const SENT = 'אם הכתובת תקינה, שלחנו אליה מייל לאישור ההרשמה.'

function field(): HTMLInputElement {
  return screen.getByLabelText('הצטרפו לרשימת הדיוור') as HTMLInputElement
}

beforeEach(() => {
  mock.state = { ok: false }
  mock.pending = false
  mock.action.mockReset()
})

describe('NewsletterSignup (UX12)', () => {
  it('renders the idle form RTL with an LTR address field and no browser validation', () => {
    const { container } = render(<NewsletterSignup source="home" />)
    const form = container.querySelector('form.ke-newsletter') as HTMLFormElement
    expect(form).toHaveAttribute('dir', 'rtl')
    expect(form.noValidate).toBe(true)
    expect(form.dataset.state).toBe('idle')
    expect(form).not.toHaveAttribute('aria-busy')
    expect(container.querySelector('input[name="source"]')).toHaveValue('home')
    const input = field()
    expect(input).toHaveAttribute('type', 'email')
    expect(input).toHaveAttribute('dir', 'ltr')
    expect(input).toHaveAttribute('inputmode', 'email')
    expect(input).toBeRequired()
    expect(input).not.toHaveAttribute('aria-invalid')
    expect(input.getAttribute('aria-describedby')).toMatch(/-consent$/)
    expect(screen.getByRole('button', { name: 'הרשמה' })).toBeEnabled()
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('stops an empty submit on the page: Hebrew alert, aria-invalid, focus, no action', () => {
    const { container } = render(<NewsletterSignup />)
    const form = container.querySelector('form') as HTMLFormElement
    act(() => {
      fireEvent.submit(form)
    })
    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('נא להזין כתובת מייל')
    expect(alert.dataset.kind).toBe('field')
    const input = field()
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input.getAttribute('aria-describedby')).toBe(
      `${alert.id.replace(/-error$/, '-consent')} ${alert.id}`,
    )
    expect(document.activeElement).toBe(input)
    expect(form.dataset.state).toBe('invalid')
    expect(mock.action).not.toHaveBeenCalled()
  })

  it('refuses the address the browser would have let through, and clears as the typing is fixed', () => {
    const { container } = render(<NewsletterSignup />)
    const form = container.querySelector('form') as HTMLFormElement
    const input = field()
    fireEvent.change(input, { target: { value: 'ofir@kenyon' } })
    act(() => {
      fireEvent.submit(form)
    })
    expect(screen.getByRole('alert')).toHaveTextContent('כתובת המייל לא תקינה, למשל name@gmail.com')
    expect(input).toHaveAttribute('aria-invalid', 'true')

    fireEvent.change(input, { target: { value: 'ofir@kenyonexpress.co.il' } })
    expect(screen.queryByRole('alert')).toBeNull()
    expect(input).not.toHaveAttribute('aria-invalid')
    expect(form.dataset.state).toBe('idle')

    act(() => {
      fireEvent.submit(form)
    })
    expect(screen.queryByRole('alert')).toBeNull()
    expect(input).not.toHaveAttribute('aria-invalid')
  })

  it('checks a non-empty value on blur and leaves an empty one alone', () => {
    render(<NewsletterSignup />)
    const input = field()
    fireEvent.blur(input)
    expect(screen.queryByRole('alert')).toBeNull()

    fireEvent.change(input, { target: { value: 'ofir.kenyonexpress.co.il' } })
    fireEvent.blur(input)
    expect(screen.getByRole('alert')).toHaveTextContent('כתובת המייל חייבת לכלול @')

    fireEvent.change(input, { target: { value: 'ofir@kenyonexpress.co.il' } })
    fireEvent.blur(input)
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('shows a server failure without blaming the field, and retires it on the next keystroke', () => {
    mock.state = { ok: false, error: 'יותר מדי ניסיונות. נסו שוב מאוחר יותר.' }
    const { container } = render(<NewsletterSignup />)
    const form = container.querySelector('form') as HTMLFormElement
    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('יותר מדי ניסיונות. נסו שוב מאוחר יותר.')
    expect(alert.dataset.kind).toBe('server')
    expect(form.dataset.state).toBe('failed')
    const input = field()
    expect(input).not.toHaveAttribute('aria-invalid')
    expect(screen.getByRole('button', { name: 'הרשמה' })).toBeEnabled()

    fireEvent.change(input, { target: { value: 'o' } })
    expect(screen.queryByRole('alert')).toBeNull()
    expect(form.dataset.state).toBe('idle')
  })

  it('marks the field when the server names it', () => {
    mock.state = { ok: false, error: 'כתובת המייל חייבת לכלול @', field: 'email' }
    const { container } = render(<NewsletterSignup />)
    expect(screen.getByRole('alert').dataset.kind).toBe('field')
    expect(field()).toHaveAttribute('aria-invalid', 'true')
    expect((container.querySelector('form') as HTMLFormElement).dataset.state).toBe('invalid')
  })

  it('disables the button and marks the form busy while sending', () => {
    mock.pending = true
    const { container } = render(<NewsletterSignup />)
    const form = container.querySelector('form') as HTMLFormElement
    expect(form).toHaveAttribute('aria-busy', 'true')
    expect(form.dataset.state).toBe('pending')
    const button = screen.getByRole('button', { name: 'שולח...' })
    expect(button).toBeDisabled()
    expect(button.querySelector('.ke-newsletter__spinner')).not.toBeNull()
    expect(field()).toHaveAttribute('readonly')
  })

  it('replaces the form with one status card on success, naming the inbox that was sent to', () => {
    const { container, rerender } = render(<NewsletterSignup />)
    const form = container.querySelector('form') as HTMLFormElement
    fireEvent.change(field(), { target: { value: ' Dana@Example.com ' } })
    act(() => {
      fireEvent.submit(form)
    })
    mock.state = { ok: true, message: SENT }
    rerender(<NewsletterSignup />)

    expect(container.querySelector('form')).toBeNull()
    const status = screen.getByRole('status')
    expect(status).toHaveAttribute('aria-live', 'polite')
    expect(status).toHaveAttribute('dir', 'rtl')
    expect(status.dataset.state).toBe('success')
    expect(status).toHaveTextContent('בדקו את תיבת המייל')
    expect(status).toHaveTextContent(SENT)
    const email = status.querySelector('bdi') as HTMLElement
    expect(email).toHaveAttribute('dir', 'ltr')
    expect(email).toHaveTextContent('dana@example.com')
    expect(status).toHaveTextContent('תיקיית הספאם')
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('still shows the success card without an address when the submit was not made from this render', () => {
    mock.state = { ok: true, message: SENT }
    render(<NewsletterSignup />)
    const status = screen.getByRole('status')
    expect(status).toHaveTextContent(SENT)
    expect(status.querySelector('bdi')).toBeNull()
  })
})
