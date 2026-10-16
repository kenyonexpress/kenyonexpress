import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { OrderVoucherCard } from './OrderVoucherCard'

describe('OrderVoucherCard', () => {
  const mockProps = {
    id: 'voucher-123',
    code: '12345678',
    qrDataUrl:
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    expiresAt: '2025-12-31',
    collectAmountAgorot: 5000,
    productName: 'ברביקיו',
    supplierInfo: {
      name: 'מסעדת אל דדו',
      address: 'רחוב הרצל 10, תל אביב',
      contact_phone: '+972-3-123-4567',
      opening_hours: '11:00 - 23:00',
    },
    siteUrl: 'https://kenyonexpress.co.il',
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders product name', () => {
    render(<OrderVoucherCard {...mockProps} />)
    expect(screen.getByText('ברביקיו')).toBeInTheDocument()
  })

  it('renders voucher code in monospace', () => {
    render(<OrderVoucherCard {...mockProps} />)
    const codeElement = screen.getByText(/12345678/)
    expect(codeElement).toHaveClass('order-voucher-card__code')
  })

  it('renders QR code image', () => {
    render(<OrderVoucherCard {...mockProps} />)
    const img = screen.getByAltText(/קוד QR/)
    expect(img).toBeInTheDocument()
    expect(img).toHaveAttribute('width', '300')
    expect(img).toHaveAttribute('height', '300')
  })

  it('renders collection amount', () => {
    render(<OrderVoucherCard {...mockProps} />)
    expect(screen.getByText(/לתשלום בעסק במימוש/)).toBeInTheDocument()
    expect(screen.getByText(/₪50.00/)).toBeInTheDocument()
  })

  it('renders supplier name', () => {
    render(<OrderVoucherCard {...mockProps} />)
    expect(screen.getByText('מסעדת אל דדו')).toBeInTheDocument()
  })

  it('renders supplier address with Google Maps link', () => {
    render(<OrderVoucherCard {...mockProps} />)
    const addressLink = screen.getByRole('link', { name: /רחוב הרצל 10/ })
    expect(addressLink).toHaveAttribute('target', '_blank')
    expect(addressLink).toHaveAttribute('href', expect.stringContaining('maps.google.com'))
  })

  it('renders supplier phone with tel: link', () => {
    render(<OrderVoucherCard {...mockProps} />)
    const phoneLink = screen.getByRole('link', { name: /\+972-3-123-4567/ })
    expect(phoneLink).toHaveAttribute('href', 'tel:+972-3-123-4567')
  })

  it('renders opening hours', () => {
    render(<OrderVoucherCard {...mockProps} />)
    expect(screen.getByText(/11:00 - 23:00/)).toBeInTheDocument()
  })

  it('renders expiry date', () => {
    render(<OrderVoucherCard {...mockProps} />)
    expect(screen.getByText(/בתוקף עד/)).toBeInTheDocument()
  })

  it('renders PDF download button', () => {
    render(<OrderVoucherCard {...mockProps} />)
    expect(screen.getByText(/הורד PDF/)).toBeInTheDocument()
  })

  it('renders wallet button', () => {
    render(<OrderVoucherCard {...mockProps} />)
    expect(screen.getByText(/ארנק דיגיטלי/)).toBeInTheDocument()
  })

  it('renders WhatsApp share button', () => {
    render(<OrderVoucherCard {...mockProps} />)
    const shareButton = screen.getByRole('link', { name: /שתף/ })
    expect(shareButton).toHaveAttribute('target', '_blank')
  })

  it('renders business WhatsApp chat link', () => {
    render(<OrderVoucherCard {...mockProps} />)
    const chatLink = screen.getByRole('link', { name: /דברו עם העסק/ })
    expect(chatLink).toHaveAttribute('target', '_blank')
  })

  it('does not render supplier info when not provided', () => {
    const propsWithoutSupplier = { ...mockProps, supplierInfo: null }
    render(<OrderVoucherCard {...propsWithoutSupplier} />)
    expect(screen.queryByText('מסעדת אל דדו')).not.toBeInTheDocument()
  })

  it('handles missing optional fields gracefully', () => {
    const minimalProps = {
      ...mockProps,
      productName: undefined,
      supplierInfo: {
        name: null,
        address: null,
        contact_phone: null,
      },
    }
    render(<OrderVoucherCard {...minimalProps} />)
    expect(screen.getByAltText(/קוד QR/)).toBeInTheDocument()
    expect(screen.getByText(/12345678/)).toBeInTheDocument()
  })

  it('renders PDF button with correct title', () => {
    render(<OrderVoucherCard {...mockProps} />)
    const pdfButton = screen.getByTitle(/הורד קופון כ-PDF/)
    expect(pdfButton).toBeInTheDocument()
  })

  it('handles zero collection amount', () => {
    const propsWithZeroAmount = { ...mockProps, collectAmountAgorot: 0 }
    render(<OrderVoucherCard {...propsWithZeroAmount} />)
    expect(screen.queryByText(/לתשלום בעסק/)).not.toBeInTheDocument()
  })
})
