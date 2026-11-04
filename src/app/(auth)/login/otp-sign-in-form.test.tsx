import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/server/actions/otp-sign-in', () => ({
  sendSignInCode: vi.fn(),
  verifySignInCode: vi.fn(),
}))

import OtpSignInForm from './OtpSignInForm'

describe('the S19 code sign-in form', () => {
  it('asks for a mobile number when the server can send WhatsApp', () => {
    render(<OtpSignInForm channel="whatsapp" />)
    const field = screen.getByLabelText('מספר נייד לקבלת קוד ב-WhatsApp')
    expect(field).toHaveAttribute('name', 'phone')
    expect(field).toHaveAttribute('type', 'tel')
    expect(field).toHaveAttribute('dir', 'ltr')
  })

  it('asks for an email when WhatsApp is not configured', () => {
    render(<OtpSignInForm channel="email" />)
    const field = screen.getByLabelText('אימייל לקבלת קוד כניסה')
    expect(field).toHaveAttribute('name', 'email')
    expect(screen.queryByLabelText(/WhatsApp/)).toBeNull()
  })

  it('carries the channel to the action', () => {
    const { container } = render(<OtpSignInForm channel="email" />)
    expect(container.querySelector('input[name="channel"]')).toHaveValue('email')
  })
})
