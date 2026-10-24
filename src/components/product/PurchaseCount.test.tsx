import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import PurchaseCount from './PurchaseCount'

// Mock the hook
vi.mock('@/hooks/useProductPurchaseCount', () => ({
  useProductPurchaseCount: vi.fn((_productId: string, initialCount: number) => initialCount),
}))

describe('PurchaseCount', () => {
  it('renders nothing when count is 0', () => {
    const { container } = render(
      <PurchaseCount productId="product-1" initialCount={0} variant="full" />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders compact variant correctly', () => {
    render(<PurchaseCount productId="product-1" initialCount={5} variant="compact" />)

    expect(screen.getByText('5 קנו לאחרונה')).toBeInTheDocument()
    expect(screen.queryByText('ב-30 הימים האחרונים')).not.toBeInTheDocument()
  })

  it('renders full variant correctly', () => {
    render(<PurchaseCount productId="product-1" initialCount={10} variant="full" />)

    expect(screen.getByText('10 אנשים קנו לאחרונה')).toBeInTheDocument()
    expect(screen.getByText('ב-30 הימים האחרונים')).toBeInTheDocument()
  })

  it('uses singular form for count of 1', () => {
    render(<PurchaseCount productId="product-1" initialCount={1} variant="full" />)

    expect(screen.getByText('1 איש קנה לאחרונה')).toBeInTheDocument()
  })

  it('uses plural form for count > 1', () => {
    render(<PurchaseCount productId="product-1" initialCount={3} variant="full" />)

    expect(screen.getByText('3 אנשים קנו לאחרונה')).toBeInTheDocument()
  })

  it('applies custom className', () => {
    const { container } = render(
      <PurchaseCount
        productId="product-1"
        initialCount={5}
        variant="full"
        className="custom-class"
      />,
    )

    const element = container.firstChild as HTMLElement
    expect(element.className).toContain('custom-class')
  })

  it('subscribes to realtime updates via hook', () => {
    const { useProductPurchaseCount } = require('@/hooks/useProductPurchaseCount')

    render(<PurchaseCount productId="product-123" initialCount={7} variant="full" />)

    expect(useProductPurchaseCount).toHaveBeenCalledWith('product-123', 7)
  })

  it('renders shopping bag icon in compact variant', () => {
    const { container } = render(
      <PurchaseCount productId="product-1" initialCount={5} variant="compact" />,
    )

    const svg = container.querySelector('svg')
    expect(svg).toBeInTheDocument()
    expect(svg).toHaveClass('h-3', 'w-3')
  })

  it('renders shopping bag icon in full variant', () => {
    const { container } = render(
      <PurchaseCount productId="product-1" initialCount={5} variant="full" />,
    )

    const svg = container.querySelector('svg')
    expect(svg).toBeInTheDocument()
    expect(svg).toHaveClass('h-5', 'w-5')
  })
})
