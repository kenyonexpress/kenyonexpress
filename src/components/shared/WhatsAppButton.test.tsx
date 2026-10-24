import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import WhatsAppButton from './WhatsAppButton'

describe('WhatsAppButton', () => {
  it('renders with correct wa.me href', () => {
    render(<WhatsAppButton href="https://wa.me/972501234567?text=test">Contact</WhatsAppButton>)
    const link = screen.getByRole('link', { name: /contact/i })
    expect(link).toHaveAttribute('href', 'https://wa.me/972501234567?text=test')
  })

  it('renders with WhatsApp green background', () => {
    render(<WhatsAppButton href="https://wa.me/972501234567">Contact</WhatsAppButton>)
    const link = screen.getByRole('link')
    expect(link).toHaveClass('bg-whatsapp')
  })

  it('has minimum 44px touch target height via token', () => {
    const { container } = render(
      <WhatsAppButton href="https://wa.me/972501234567">Contact</WhatsAppButton>,
    )
    const link = container.querySelector('a')
    expect(link).toHaveClass('min-h-touch-min')
  })

  it('renders small size variant', () => {
    const { container } = render(
      <WhatsAppButton href="https://wa.me/972501234567" size="sm">
        Contact
      </WhatsAppButton>,
    )
    const link = container.querySelector('a')
    expect(link).toHaveClass('min-h-touch-min')
    expect(link).toHaveClass('text-sm')
  })

  it('renders medium size variant by default', () => {
    const { container } = render(
      <WhatsAppButton href="https://wa.me/972501234567">Contact</WhatsAppButton>,
    )
    const link = container.querySelector('a')
    expect(link).toHaveClass('min-h-touch-min')
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

  it('supports mailto fallback href', () => {
    const mailtoHref = 'mailto:support@kenyonexpress.co.il?subject=test'
    render(<WhatsAppButton href={mailtoHref}>Contact</WhatsAppButton>)
    const link = screen.getByRole('link')
    expect(link).toHaveAttribute('href', mailtoHref)
  })

  it('supports wa.me with Hebrew encoded text', () => {
    const hebrewMessage = encodeURIComponent('הזמנה KE-20261025-00001')
    const href = `https://wa.me/972501234567?text=${hebrewMessage}`
    render(<WhatsAppButton href={href}>Contact</WhatsAppButton>)
    const link = screen.getByRole('link')
    expect(link).toHaveAttribute('href', href)
  })

  it('supports wa.me with product share format', () => {
    const shareMessage = encodeURIComponent('ראה דיל: https://kenyonexpress.co.il/product/test')
    const href = `https://wa.me/?text=${shareMessage}`
    render(<WhatsAppButton href={href}>שתף</WhatsAppButton>)
    const link = screen.getByRole('link')
    expect(link).toHaveAttribute('href', href)
  })
})
