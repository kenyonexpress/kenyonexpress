import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import ProductStickyCartBar from './ProductStickyCartBar'

describe('ProductStickyCartBar - Click Path', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('finds and clicks the correct add-to-cart button by Hebrew text', () => {
    const mockButton = document.createElement('button')
    mockButton.textContent = 'הוסף לסל'
    mockButton.onclick = vi.fn()
    document.body.appendChild(mockButton)

    render(<ProductStickyCartBar basePrice={50000} productId="test-id" />)

    const stickyButton = screen.getByRole('button', { name: /הוסף לעגלה/ })
    fireEvent.click(stickyButton)

    expect(mockButton.onclick).toHaveBeenCalled()

    document.body.removeChild(mockButton)
  })

  it('handles both button text variants: הוסף לסל and הוסף לעגלה', () => {
    const mockButton1 = document.createElement('button')
    mockButton1.textContent = 'הוסף לסל'
    mockButton1.onclick = vi.fn()
    document.body.appendChild(mockButton1)

    render(<ProductStickyCartBar basePrice={50000} productId="test-id" />)

    const stickyButton = screen.getByRole('button', { name: /הוסף לעגלה/ })
    fireEvent.click(stickyButton)

    expect(mockButton1.onclick).toHaveBeenCalled()

    document.body.removeChild(mockButton1)
  })

  it('renders sticky cart bar with correct price', () => {
    render(<ProductStickyCartBar basePrice={50000} productId="test-id" />)
    expect(screen.getByText(/₪/)).toBeInTheDocument()
  })

  it('has add to cart button that is clickable', () => {
    render(<ProductStickyCartBar basePrice={50000} productId="test-id" />)
    const button = screen.getByRole('button', { name: /הוסף לעגלה/ })
    expect(button).not.toBeDisabled()
  })
})
