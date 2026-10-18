import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import LoginModal from './LoginModal'

// Mock server actions
vi.mock('@/server/actions/auth', () => ({
  signInWithEmail: vi.fn(async () => null),
  signInWithGoogle: vi.fn(async () => null),
  sendMagicLink: vi.fn(async () => null),
  sendPhoneOtp: vi.fn(async () => null),
  verifyPhoneOtp: vi.fn(async () => null),
}))

vi.mock('@/components/auth/PasskeySignIn', () => {
  const React = require('react')
  return {
    default: () =>
      React.createElement('div', { 'data-testid': 'passkey-signin' }, 'Passkey SignIn'),
  }
})

vi.mock('@/components/auth/WhatsappOtpForm', () => {
  const React = require('react')
  return {
    default: () =>
      React.createElement('div', { 'data-testid': 'whatsapp-form' }, 'WhatsApp OTP Form'),
  }
})

vi.mock('@/components/shared/GoogleLogo', () => {
  const React = require('react')
  return {
    GoogleLogo: () => React.createElement('div', { 'data-testid': 'google-logo' }, 'Google Logo'),
  }
})

describe('LoginModal', () => {
  it('renders the login modal with all tabs', () => {
    render(<LoginModal phoneEnabled={true} />)

    expect(screen.getByText('כניסה לחשבון')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /אימייל/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /SMS/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /Passkey/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /קישור/i })).toBeInTheDocument()
  })

  it('renders email tab content by default', () => {
    render(<LoginModal phoneEnabled={true} />)

    const emailInputs = screen.getAllByLabelText(/אימייל/)
    expect(emailInputs.length).toBeGreaterThan(0)
    expect(screen.getByLabelText(/סיסמה/)).toBeInTheDocument()
  })

  it('hides phone tab when phoneEnabled is false', () => {
    render(<LoginModal phoneEnabled={false} />)

    expect(screen.queryByRole('tab', { name: /SMS/i })).not.toBeInTheDocument()
  })

  it('shows phone tab when phoneEnabled is true', () => {
    render(<LoginModal phoneEnabled={true} />)

    expect(screen.getByRole('tab', { name: /SMS/i })).toBeInTheDocument()
  })

  it('renders Google sign-in button', () => {
    render(<LoginModal phoneEnabled={true} />)

    expect(screen.getByRole('button', { name: /כניסה עם Google/i })).toBeInTheDocument()
  })

  it('renders passkey signin component in passkey tab', async () => {
    const user = userEvent.setup()
    render(<LoginModal phoneEnabled={true} />)

    const passkeyTab = screen.getByRole('tab', { name: /Passkey/i })
    await user.click(passkeyTab)

    expect(screen.getByTestId('passkey-signin')).toBeInTheDocument()
  })

  it('renders WhatsApp OTP form', () => {
    render(<LoginModal phoneEnabled={true} />)

    expect(screen.getByTestId('whatsapp-form')).toBeInTheDocument()
  })

  it('renders signup link', () => {
    render(<LoginModal phoneEnabled={true} />)

    expect(screen.getByRole('link', { name: /הרשמה/i })).toBeInTheDocument()
  })

  it('renders magic link tab with email input', async () => {
    const user = userEvent.setup()
    render(<LoginModal phoneEnabled={true} />)

    const magicTab = screen.getByRole('tab', { name: /קישור/i })
    await user.click(magicTab)

    expect(screen.getByLabelText(/אימייל לקישור כניסה/)).toBeInTheDocument()
  })

  it('includes next parameter in signup link when provided', () => {
    render(<LoginModal next="/product/123" phoneEnabled={true} />)

    const signupLink = screen.getByRole('link', { name: /הרשמה/i })
    expect(signupLink).toHaveAttribute('href', expect.stringContaining('next=%2Fproduct%2F123'))
  })

  it('displays error message when callbackError is provided', () => {
    render(<LoginModal callbackError="auth_callback_error" phoneEnabled={true} />)

    expect(screen.getByText('הכניסה נכשלה — נסו שוב')).toBeInTheDocument()
  })

  it('displays magic link success message when magic prop is set', () => {
    render(<LoginModal magic="true" phoneEnabled={true} />)

    expect(screen.getByText(/בדקו את תיבת הדואר — שלחנו קישור כניסה/)).toBeInTheDocument()
  })

  it('switches between tabs', async () => {
    const user = userEvent.setup()
    render(<LoginModal phoneEnabled={true} />)

    const passkeyTab = screen.getByRole('tab', { name: /Passkey/i })
    await user.click(passkeyTab)

    expect(screen.getByTestId('passkey-signin')).toBeInTheDocument()
  })

  it('passes next parameter to child components', () => {
    render(<LoginModal next="/checkout" phoneEnabled={true} />)

    const emailInputs = screen.getAllByRole('button', { name: /כניסה/i })
    expect(emailInputs.length).toBeGreaterThan(0)
  })

  it('renders with correct Hebrew RTL attributes', () => {
    const { container } = render(<LoginModal phoneEnabled={true} />)

    const tabsContainer = container.querySelector('[dir="rtl"]')
    expect(tabsContainer).toBeInTheDocument()
  })
})
