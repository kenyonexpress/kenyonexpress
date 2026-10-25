import { render, screen, waitFor } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import GiftButton from './GiftButton'

const mockPush = vi.fn()
const mockAddToCart = vi.fn().mockResolvedValue(undefined)

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}))

vi.mock('@/components/cart/CartProvider', () => ({
  useCart: () => ({
    addToCart: mockAddToCart,
    isPending: false,
  }),
}))

vi.mock('@/components/icons/electro-icons', () => ({
  EcFavorites: () => <span data-testid="gift-icon">🎁</span>,
}))

describe('GiftButton', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders nothing for non-coupon products', () => {
    const { container } = render(<GiftButton productId="prod_123" isCoupon={false} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders button for coupon products', () => {
    render(<GiftButton productId="prod_123" isCoupon={true} />)
    expect(screen.getByRole('button', { name: /שלח כמתנה/i })).toBeInTheDocument()
  })

  it('adds to cart and redirects to checkout with gift flag', async () => {
    const user = userEvent.setup()
    render(<GiftButton productId="prod_123" isCoupon={true} />)

    const button = screen.getByRole('button', { name: /שלח כמתנה/i })
    await user.click(button)

    await waitFor(() => {
      expect(mockAddToCart).toHaveBeenCalledWith('prod_123', null, 1)
    })

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/checkout?gift=true')
    })
  })

  it('disables button while adding to cart', async () => {
    const user = userEvent.setup()
    render(<GiftButton productId="prod_123" isCoupon={true} />)

    const button = screen.getByRole('button', { name: /שלח כמתנה/i })
    await user.click(button)

    expect(button).toHaveTextContent('מוסיף...')
  })

  it('handles add to cart errors gracefully', async () => {
    mockAddToCart.mockRejectedValueOnce(new Error('Cart error'))

    const user = userEvent.setup()
    render(<GiftButton productId="prod_123" isCoupon={true} />)

    const button = screen.getByRole('button', { name: /שלח כמתנה/i })
    await user.click(button)

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
    })

    // Button should be re-enabled after error
    expect(button).not.toBeDisabled()
    expect(button).toHaveTextContent('שלח כמתנה')
  })
})
