import { fireEvent, render, screen } from '@testing-library/react'
import StickyCartBar from './StickyCartBar'

describe('StickyCartBar', () => {
  it('displays the price formatted as currency', () => {
    const onAddToCart = vi.fn()
    const { container } = render(<StickyCartBar price={100} onAddToCart={onAddToCart} />)
    const priceText = container.querySelector('[data-sticky-cart-bar] span:last-of-type')
    expect(priceText).toHaveTextContent(/100/)
  })

  it('displays add to cart button', () => {
    const onAddToCart = vi.fn()
    render(<StickyCartBar price={100} onAddToCart={onAddToCart} />)
    expect(screen.getByRole('button', { name: /הוסף לסל/ })).toBeInTheDocument()
  })

  it('calls onAddToCart when button is clicked', () => {
    const onAddToCart = vi.fn()
    render(<StickyCartBar price={100} onAddToCart={onAddToCart} />)
    const button = screen.getByRole('button', { name: /הוסף לסל/ })
    fireEvent.click(button)
    expect(onAddToCart).toHaveBeenCalledOnce()
  })

  it('shows loading state', () => {
    const onAddToCart = vi.fn()
    render(<StickyCartBar price={100} onAddToCart={onAddToCart} isLoading={true} />)
    expect(screen.getByText('מוסיף...')).toBeInTheDocument()
    const button = screen.getByRole('button')
    expect(button).toBeDisabled()
  })

  it('disables button when loading', () => {
    const onAddToCart = vi.fn()
    render(<StickyCartBar price={100} onAddToCart={onAddToCart} isLoading={true} />)
    const button = screen.getByRole('button')
    fireEvent.click(button)
    expect(onAddToCart).not.toHaveBeenCalled()
  })

  it('has data-sticky-cart-bar attribute', () => {
    const onAddToCart = vi.fn()
    const { container } = render(<StickyCartBar price={100} onAddToCart={onAddToCart} />)
    expect(container.querySelector('[data-sticky-cart-bar]')).toBeInTheDocument()
  })

  it('formats large prices correctly', () => {
    const onAddToCart = vi.fn()
    const { container } = render(<StickyCartBar price={10000} onAddToCart={onAddToCart} />)
    const priceText = container.querySelector('[data-sticky-cart-bar] span:last-of-type')
    expect(priceText).toHaveTextContent(/10/)
  })

  it('button has type="button"', () => {
    const onAddToCart = vi.fn()
    render(<StickyCartBar price={100} onAddToCart={onAddToCart} />)
    const button = screen.getByRole('button')
    expect(button).toHaveAttribute('type', 'button')
  })
})
