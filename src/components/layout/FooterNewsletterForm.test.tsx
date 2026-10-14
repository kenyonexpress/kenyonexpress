import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * UX12: the footer pill on the brand-yellow bar. Pinned: the measured 470x41
 * geometry classes are untouched, the browser's own validation is off, an
 * empty submit is answered under the pill in Hebrew with the field marked
 * invalid (a red inset ring through the `aria-invalid:` variant), the
 * sentence is heading ink and never red or white on the yellow, and a
 * success swaps the pill for a status line of the same height.
 */

const mock = vi.hoisted(() => ({
  state: { ok: false } as { ok: boolean; message?: string; error?: string; field?: 'email' },
  pending: false,
}))

vi.mock('@/server/actions/newsletter', () => ({ subscribeToNewsletter: vi.fn() }))
vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react')
  return {
    ...actual,
    useActionState: () => [mock.state, vi.fn(), mock.pending],
  }
})

import FooterNewsletterForm from './FooterNewsletterForm'

beforeEach(() => {
  mock.state = { ok: false }
  mock.pending = false
})

describe('FooterNewsletterForm (UX12)', () => {
  it('keeps the measured pill and turns the browser bubble off', () => {
    const { container } = render(<FooterNewsletterForm />)
    const wrap = container.firstElementChild as HTMLElement
    expect(wrap.className).toContain('lg:w-newsletter-min')
    expect(wrap.dataset.newsletterState).toBe('idle')
    const form = container.querySelector('form') as HTMLFormElement
    expect(form.className).toContain('h-newsletter-field')
    expect(form.className).toContain('rounded-full')
    expect(form.noValidate).toBe(true)
    const input = screen.getByLabelText('כתובת אימייל לניוזלטר')
    expect(input).toHaveAttribute('dir', 'ltr')
    expect(input).toHaveAttribute('type', 'email')
    expect(input.className).toContain('aria-invalid:ring-error')
    expect(input).not.toHaveAttribute('aria-describedby')
    expect(screen.getByRole('button', { name: 'הירשם' })).toBeEnabled()
    expect(container.querySelector('input[name="source"]')).toHaveValue('footer')
  })

  it('answers an empty submit under the pill, in heading ink, with the field marked', () => {
    const { container } = render(<FooterNewsletterForm />)
    act(() => {
      fireEvent.submit(container.querySelector('form') as HTMLFormElement)
    })
    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('נא להזין כתובת מייל')
    expect(alert.className).toContain('text-heading')
    expect(alert.className).not.toMatch(/text-(white|error|price|deal-sale)/)
    const input = screen.getByLabelText('כתובת אימייל לניוזלטר')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input).toHaveAttribute('aria-describedby', alert.id)
    expect(document.activeElement).toBe(input)
    expect((container.firstElementChild as HTMLElement).dataset.newsletterState).toBe('invalid')
  })

  it('shows a server failure with the pill still live for a retry', () => {
    mock.state = { ok: false, error: 'ההרשמה נכשלה. נסו שוב.' }
    const { container } = render(<FooterNewsletterForm />)
    expect(screen.getByRole('alert')).toHaveTextContent('ההרשמה נכשלה. נסו שוב.')
    expect(screen.getByRole('alert').dataset.kind).toBe('server')
    expect(screen.getByLabelText('כתובת אימייל לניוזלטר')).not.toHaveAttribute('aria-invalid')
    expect(screen.getByRole('button', { name: 'הירשם' })).toBeEnabled()
    expect((container.firstElementChild as HTMLElement).dataset.newsletterState).toBe('failed')
  })

  it('disables the button while sending', () => {
    mock.pending = true
    const { container } = render(<FooterNewsletterForm />)
    expect(screen.getByRole('button', { name: 'שולח...' })).toBeDisabled()
    expect(container.querySelector('form')).toHaveAttribute('aria-busy', 'true')
  })

  it('swaps the pill for a status line of the same height on success', () => {
    const { container, rerender } = render(<FooterNewsletterForm />)
    fireEvent.change(screen.getByLabelText('כתובת אימייל לניוזלטר'), {
      target: { value: 'ofir@kenyonexpress.co.il' },
    })
    act(() => {
      fireEvent.submit(container.querySelector('form') as HTMLFormElement)
    })
    mock.state = { ok: true, message: 'אם הכתובת תקינה, שלחנו אליה מייל לאישור ההרשמה.' }
    rerender(<FooterNewsletterForm />)
    expect(container.querySelector('form')).toBeNull()
    const status = screen.getByRole('status')
    expect(status.className).toContain('min-h-newsletter-field')
    expect(status.className).toContain('text-heading')
    expect(status).toHaveTextContent('שלחנו אליה מייל לאישור ההרשמה')
    expect(status.querySelector('bdi')).toHaveAttribute('dir', 'ltr')
    expect(status.querySelector('bdi')).toHaveTextContent('ofir@kenyonexpress.co.il')
    expect((container.firstElementChild as HTMLElement).dataset.newsletterState).toBe('success')
  })
})
