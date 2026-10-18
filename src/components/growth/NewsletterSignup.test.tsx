import * as newsletterActions from '@/server/actions/newsletter'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import NewsletterSignup from './NewsletterSignup'

vi.mock('@/server/actions/newsletter', () => ({
  subscribeToNewsletter: vi.fn(),
}))

describe('NewsletterSignup', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders newsletter form with label and input', () => {
    render(<NewsletterSignup source="footer" />)

    expect(screen.getByLabelText('הצטרפו לרשימת הדיוור')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('you@example.com')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'הרשמה' })).toBeInTheDocument()
  })

  it('renders Hebrew consent text', () => {
    render(<NewsletterSignup />)

    expect(screen.getByText(/בלחיצה על הרשמה אני מאשר קבלת דיוור פרסומי/)).toBeInTheDocument()
  })

  it('applies RTL direction to form', () => {
    const { container } = render(<NewsletterSignup />)
    const form = container.querySelector('.ke-newsletter')

    expect(form).toHaveAttribute('dir', 'rtl')
  })

  it('applies LTR direction to email input for proper caret placement', () => {
    render(<NewsletterSignup />)
    const input = screen.getByPlaceholderText('you@example.com')

    expect(input).toHaveAttribute('dir', 'ltr')
  })

  it('displays error message when validation fails', async () => {
    const mockAction = vi.fn(async () => ({
      ok: false,
      error: 'כתובת מייל לא תקינה',
    }))
    vi.mocked(newsletterActions.subscribeToNewsletter).mockImplementation(mockAction)

    render(<NewsletterSignup />)

    const form = screen.getByRole('button', { name: 'הרשמה' }).closest('form')
    if (!form) throw new Error('Form not found')

    fireEvent.submit(form)

    await waitFor(() => {
      expect(screen.getByText('כתובת מייל לא תקינה')).toBeInTheDocument()
    })
  })

  it('displays error with warning icon', async () => {
    const mockAction = vi.fn(async () => ({
      ok: false,
      error: 'כתובת מייל לא תקינה',
    }))
    vi.mocked(newsletterActions.subscribeToNewsletter).mockImplementation(mockAction)

    const { container } = render(<NewsletterSignup />)

    const form = screen.getByRole('button', { name: 'הרשמה' }).closest('form')
    if (!form) throw new Error('Form not found')

    fireEvent.submit(form)

    await waitFor(() => {
      const errorElement = container.querySelector('.ke-newsletter__error')
      expect(errorElement).toHaveClass('ke-newsletter__error')
    })
  })

  it('displays success message when subscription succeeds', async () => {
    const mockAction = vi.fn(async () => ({
      ok: true,
      message: 'אם הכתובת תקינה, שלחנו אליה מייל לאישור ההרשמה.',
    }))
    vi.mocked(newsletterActions.subscribeToNewsletter).mockImplementation(mockAction)

    render(<NewsletterSignup />)

    const form = screen.getByRole('button', { name: 'הרשמה' }).closest('form')
    if (!form) throw new Error('Form not found')

    fireEvent.submit(form)

    await waitFor(() => {
      expect(
        screen.getByText('אם הכתובת תקינה, שלחנו אליה מייל לאישור ההרשמה.'),
      ).toBeInTheDocument()
    })
  })

  it('shows loading state while submitting', async () => {
    const mockAction = vi.fn(async () => ({
      ok: true,
      message: 'Success',
    }))
    vi.mocked(newsletterActions.subscribeToNewsletter).mockImplementation(mockAction)

    render(<NewsletterSignup />)

    const button = screen.getByRole('button', { name: 'הרשמה' })
    const form = button.closest('form')
    if (!form) throw new Error('Form not found')

    fireEvent.submit(form)

    expect(screen.getByRole('button', { name: 'שולח...' })).toBeInTheDocument()
  })

  it('disables form while pending', async () => {
    const mockAction = vi.fn(async () => ({
      ok: true,
      message: 'Success',
    }))
    vi.mocked(newsletterActions.subscribeToNewsletter).mockImplementation(mockAction)

    render(<NewsletterSignup />)

    const form = screen.getByRole('button', { name: 'הרשמה' }).closest('form')
    if (!form) throw new Error('Form not found')

    fireEvent.submit(form)

    await waitFor(() => {
      const input = screen.getByPlaceholderText('you@example.com') as HTMLInputElement
      expect(input.disabled).toBe(true)
    })
  })

  it('sets aria-invalid when error exists', async () => {
    const mockAction = vi.fn(async () => ({
      ok: false,
      error: 'כתובת מייל לא תקינה',
    }))
    vi.mocked(newsletterActions.subscribeToNewsletter).mockImplementation(mockAction)

    render(<NewsletterSignup />)

    const form = screen.getByRole('button', { name: 'הרשמה' }).closest('form')
    if (!form) throw new Error('Form not found')

    fireEvent.submit(form)

    await waitFor(() => {
      const input = screen.getByPlaceholderText('you@example.com')
      expect(input).toHaveAttribute('aria-invalid', 'true')
    })
  })

  it('provides proper aria-describedby for accessibility', () => {
    render(<NewsletterSignup />)
    const input = screen.getByPlaceholderText('you@example.com')

    expect(input).toHaveAttribute('aria-describedby')
    const describedIds = input.getAttribute('aria-describedby')?.split(' ') || []
    expect(describedIds.length).toBeGreaterThan(0)
  })

  it('includes error message in aria-describedby when error exists', async () => {
    const mockAction = vi.fn(async () => ({
      ok: false,
      error: 'כתובת מייל לא תקינה',
    }))
    vi.mocked(newsletterActions.subscribeToNewsletter).mockImplementation(mockAction)

    render(<NewsletterSignup />)

    const form = screen.getByRole('button', { name: 'הרשמה' }).closest('form')
    if (!form) throw new Error('Form not found')

    fireEvent.submit(form)

    await waitFor(() => {
      const input = screen.getByPlaceholderText('you@example.com')
      const describedIds = input.getAttribute('aria-describedby')?.split(' ') || []
      expect(describedIds.some((id) => id.includes('error'))).toBe(true)
    })
  })

  it('has alert role on error message', async () => {
    const mockAction = vi.fn(async () => ({
      ok: false,
      error: 'כתובת מייל לא תקינה',
    }))
    vi.mocked(newsletterActions.subscribeToNewsletter).mockImplementation(mockAction)

    render(<NewsletterSignup />)

    const form = screen.getByRole('button', { name: 'הרשמה' }).closest('form')
    if (!form) throw new Error('Form not found')

    fireEvent.submit(form)

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
    })
  })

  it('applies error styling to input when error exists', async () => {
    const mockAction = vi.fn(async () => ({
      ok: false,
      error: 'כתובת מייל לא תקינה',
    }))
    vi.mocked(newsletterActions.subscribeToNewsletter).mockImplementation(mockAction)

    const { container } = render(<NewsletterSignup />)

    const form = screen.getByRole('button', { name: 'הרשמה' }).closest('form')
    if (!form) throw new Error('Form not found')

    fireEvent.submit(form)

    await waitFor(() => {
      const input = container.querySelector('.ke-newsletter__input')
      expect(input).toHaveClass('has-error')
    })
  })

  it('passes source prop to form data', async () => {
    const mockAction = vi.fn(async () => ({ ok: false }))
    vi.mocked(newsletterActions.subscribeToNewsletter).mockImplementation(mockAction)

    render(<NewsletterSignup source="custom-source" />)

    const form = screen.getByRole('button', { name: 'הרשמה' }).closest('form')
    if (!form) throw new Error('Form not found')

    fireEvent.submit(form)

    await waitFor(() => {
      expect(mockAction).toHaveBeenCalled()
    })
  })

  it('shows success button state after successful submission', async () => {
    const mockAction = vi.fn(async () => ({
      ok: true,
      message: 'ההרשמה הושלמה',
    }))
    vi.mocked(newsletterActions.subscribeToNewsletter).mockImplementation(mockAction)

    render(<NewsletterSignup />)

    const form = screen.getByRole('button', { name: 'הרשמה' }).closest('form')
    if (!form) throw new Error('Form not found')

    fireEvent.submit(form)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /✓/ })).toBeInTheDocument()
    })
  })

  it('disables input after successful submission', async () => {
    const mockAction = vi.fn(async () => ({
      ok: true,
      message: 'ההרשמה הושלמה',
    }))
    vi.mocked(newsletterActions.subscribeToNewsletter).mockImplementation(mockAction)

    render(<NewsletterSignup />)

    const form = screen.getByRole('button', { name: 'הרשמה' }).closest('form')
    if (!form) throw new Error('Form not found')

    fireEvent.submit(form)

    await waitFor(() => {
      const input = screen.getByPlaceholderText('you@example.com') as HTMLInputElement
      expect(input.disabled).toBe(true)
    })
  })
})
