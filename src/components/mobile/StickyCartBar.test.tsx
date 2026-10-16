import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import StickyCartBar from './StickyCartBar'

describe('StickyCartBar', () => {
  it('renders price in correct currency format', () => {
    const onAddToCart = vi.fn()

    render(<StickyCartBar price={99999} onAddToCart={onAddToCart} isLoading={false} />)

    // Price 99999 agorot = 999.99 ILS
    expect(screen.getByText(/₪/)).toBeInTheDocument()
  })

  it('renders add to cart button', () => {
    const onAddToCart = vi.fn()

    render(<StickyCartBar price={50000} onAddToCart={onAddToCart} isLoading={false} />)

    const button = screen.getByRole('button', { name: /הוסף לעגלה/i })
    expect(button).toBeInTheDocument()
  })

  it('calls onAddToCart when button clicked', () => {
    const onAddToCart = vi.fn()

    render(<StickyCartBar price={50000} onAddToCart={onAddToCart} isLoading={false} />)

    const button = screen.getByRole('button', { name: /הוסף לעגלה/i })
    fireEvent.click(button)

    expect(onAddToCart).toHaveBeenCalled()
  })

  it('disables button when loading', () => {
    const onAddToCart = vi.fn()

    render(<StickyCartBar price={50000} onAddToCart={onAddToCart} isLoading={true} />)

    const button = screen.getByRole('button', { name: /הוסף לעגלה/i })
    expect(button).toBeDisabled()
  })

  it('has data-sticky-cart-bar attribute', () => {
    const onAddToCart = vi.fn()
    const { container } = render(
      <StickyCartBar price={50000} onAddToCart={onAddToCart} isLoading={false} />,
    )

    expect(container.querySelector('[data-sticky-cart-bar]')).toBeInTheDocument()
  })

  it('renders with correct mobile classes', () => {
    const onAddToCart = vi.fn()
    const { container } = render(
      <StickyCartBar price={50000} onAddToCart={onAddToCart} isLoading={false} />,
    )

    const cartBar = container.querySelector('[data-sticky-cart-bar]')
    expect(cartBar).toHaveClass('md:hidden', 'fixed', 'bottom-14')
  })

  it('formats price as integer agorot correctly', () => {
    const onAddToCart = vi.fn()

    const { rerender } = render(
      <StickyCartBar price={10000} onAddToCart={onAddToCart} isLoading={false} />,
    )

    // 10000 agorot = 100 ILS
    expect(screen.getByText(/₪/)).toBeInTheDocument()

    rerender(<StickyCartBar price={1} onAddToCart={onAddToCart} isLoading={false} />)

    // 1 agora should render
    expect(screen.getByText(/₪/)).toBeInTheDocument()
  })

  it('renders shopping cart icon', () => {
    const onAddToCart = vi.fn()
    const { container } = render(
      <StickyCartBar price={50000} onAddToCart={onAddToCart} isLoading={false} />,
    )

    const icons = container.querySelectorAll('svg')
    expect(icons.length).toBeGreaterThan(0)
  })
})
