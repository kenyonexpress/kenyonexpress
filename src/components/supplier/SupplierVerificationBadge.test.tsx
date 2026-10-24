import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import SupplierVerificationBadge from './SupplierVerificationBadge'

describe('SupplierVerificationBadge', () => {
  it('renders verified badge with supplier name', () => {
    render(<SupplierVerificationBadge status="verified" supplierName="Test Supplier" />)

    const badge = screen.getByText('ספק מאומת')
    expect(badge).toBeDefined()
    expect(badge.closest('div')).toHaveAttribute('title', 'Test Supplier - ספק מאומת')
  })

  it('renders verified badge without supplier name', () => {
    render(<SupplierVerificationBadge status="verified" />)

    const badge = screen.getByText('ספק מאומת')
    expect(badge).toBeDefined()
    expect(badge.closest('div')).toHaveAttribute('title', 'ספק מאומת')
  })

  it('does not render for pending status', () => {
    const { container } = render(<SupplierVerificationBadge status="pending" />)
    expect(container.firstChild).toBeNull()
  })

  it('does not render for unverified status', () => {
    const { container } = render(<SupplierVerificationBadge status="unverified" />)
    expect(container.firstChild).toBeNull()
  })

  it('applies custom className', () => {
    render(<SupplierVerificationBadge status="verified" className="custom-class" />)

    const badge = screen.getByText('ספק מאומת')
    expect(badge.closest('div')).toHaveClass('custom-class')
  })

  it('has correct accessibility attributes', () => {
    render(<SupplierVerificationBadge status="verified" supplierName="Test Supplier" />)

    const badge = screen.getByText('ספק מאומת')
    const container = badge.closest('div')
    expect(container).toHaveAttribute('aria-label', 'Test Supplier - ספק מאומת')
    expect(container).toHaveAttribute('title', 'Test Supplier - ספק מאומת')
  })

  it('renders check icon', () => {
    render(<SupplierVerificationBadge status="verified" />)

    const badge = screen.getByText('ספק מאומת')
    const container = badge.closest('div')
    const svg = container?.querySelector('svg')
    expect(svg).toBeDefined()
  })
})
