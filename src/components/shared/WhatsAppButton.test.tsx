import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import WhatsAppButton from './WhatsAppButton'

describe('WhatsAppButton', () => {
  it('renders with correct href', () => {
    render(<WhatsAppButton href="https://wa.me/972501234567?text=test">Contact</WhatsAppButton>)
    const link = screen.getByRole('link', { name: /contact/i })
    expect(link).toHaveAttribute('href', 'https://wa.me/972501234567?text=test')
  })

  it('renders with WhatsApp green background', () => {
    render(<WhatsAppButton href="https://wa.me/972501234567">Contact</WhatsAppButton>)
    const link = screen.getByRole('link')
    expect(link).toHaveClass('bg-whatsapp')
  })

  it('has minimum 44px touch target height', () => {
    const { container } = render(
      <WhatsAppButton href="https://wa.me/972501234567">Contact</WhatsAppButton>,
    )
    const link = container.querySelector('a')
    expect(link).toHaveClass('min-h-[44px]')
  })

  it('renders small size variant', () => {
    const { container } = render(
      <WhatsAppButton href="https://wa.me/972501234567" size="sm">
        Contact
      </WhatsAppButton>,
    )
    const link = container.querySelector('a')
    expect(link).toHaveClass('min-h-[44px]')
    expect(link).toHaveClass('text-sm')
  })

  it('renders medium size variant by default', () => {
    const { container } = render(
      <WhatsAppButton href="https://wa.me/972501234567">Contact</WhatsAppButton>,
    )
    const link = container.querySelector('a')
    expect(link).toHaveClass('min-h-[44px]')
    expect(link).toHaveClass('text-base')
  })

  it('opens in new tab with noopener noreferrer', () => {
    render(<WhatsAppButton href="https://wa.me/972501234567">Contact</WhatsAppButton>)
    const link = screen.getByRole('link')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('accepts custom className', () => {
    const { container } = render(
      <WhatsAppButton href="https://wa.me/972501234567" className="custom-class">
        Contact
      </WhatsAppButton>,
    )
    const link = container.querySelector('a')
    expect(link).toHaveClass('custom-class')
  })
})
