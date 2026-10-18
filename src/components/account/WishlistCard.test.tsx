import * as cartActions from '@/server/actions/cart'
import * as reviewActions from '@/server/actions/reviews'
import type { WishlistEntry } from '@/server/queries/wishlist'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import WishlistCard from './WishlistCard'

vi.mock('@/server/actions/cart')
vi.mock('@/server/actions/reviews')

const mockAddToCart = vi.mocked(cartActions.addToCart)
const mockToggleWishlist = vi.mocked(reviewActions.toggleWishlist)

const mockEntry: WishlistEntry = {
  product_id: 'test-product-123',
  created_at: '2024-01-01T00:00:00Z',
  product: {
    name_he: 'מוצר בדיקה',
    slug: 'test-product',
    price_ils: 10000,
    images: ['https://example.com/image.jpg'],
  },
}

const mockEntryNoImage: WishlistEntry = {
  product_id: 'test-product-456',
  created_at: '2024-01-01T00:00:00Z',
  product: {
    name_he: 'מוצר בלי תמונה',
    slug: 'no-image-product',
    price_ils: 5000,
    images: [],
  },
}

const mockEntryNoProduct: WishlistEntry = {
  product_id: 'test-product-789',
  created_at: '2024-01-01T00:00:00Z',
  product: null,
}

describe('WishlistCard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders product name and price', () => {
    const { container } = render(<WishlistCard entry={mockEntry} />)
    expect(screen.getByText('מוצר בדיקה')).toBeInTheDocument()
    const priceText = container.textContent
    expect(priceText).toContain('10')
    expect(priceText).toContain('₪')
  })

  it('renders product image with correct styling', () => {
    const { container } = render(<WishlistCard entry={mockEntry} />)
    const img = container.querySelector('img')
    expect(img).toBeInTheDocument()
    expect(img).toHaveAttribute('src')
    expect(img).toHaveClass('object-cover')
    expect(img).toHaveClass('rounded-lg')
  })

  it('renders placeholder when no image provided', () => {
    const { container } = render(<WishlistCard entry={mockEntryNoImage} />)
    const placeholder = container.querySelector('.h-20.w-20.rounded-lg.bg-surface-hover')
    expect(placeholder).toBeInTheDocument()
  })

  it('renders link to product page when slug exists', () => {
    render(<WishlistCard entry={mockEntry} />)
    const link = screen.getByRole('link')
    expect(link).toHaveAttribute('href', '/product/test-product')
  })

  it('renders product details without link when no slug', () => {
    render(<WishlistCard entry={mockEntryNoProduct} />)
    expect(screen.getByText('מוצר')).toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })

  it('renders move to cart button', () => {
    render(<WishlistCard entry={mockEntry} />)
    expect(screen.getByText('העבר לעגלה')).toBeInTheDocument()
  })

  it('renders remove button', () => {
    render(<WishlistCard entry={mockEntry} />)
    expect(screen.getByLabelText('הסר מרשימת המשאלות')).toBeInTheDocument()
  })

  it('calls addToCart when move to cart button is clicked', async () => {
    mockAddToCart.mockResolvedValue({ ok: true, cart: {} as any })
    render(<WishlistCard entry={mockEntry} />)

    const button = screen.getByText('העבר לעגלה')
    fireEvent.click(button)

    await waitFor(() => {
      expect(mockAddToCart).toHaveBeenCalledWith('test-product-123', null, 1)
    })
  })

  it('shows success message when add to cart succeeds', async () => {
    mockAddToCart.mockResolvedValue({ ok: true, cart: {} as any })
    render(<WishlistCard entry={mockEntry} />)

    const button = screen.getByText('העבר לעגלה')
    fireEvent.click(button)

    await waitFor(() => {
      expect(screen.getByText('נוסף לעגלה')).toBeInTheDocument()
    })
  })

  it('shows error message when add to cart fails', async () => {
    mockAddToCart.mockResolvedValue({ ok: false, error: 'מוצר לא זמין', code: 'UNAVAILABLE' })
    render(<WishlistCard entry={mockEntry} />)

    const button = screen.getByText('העבר לעגלה')
    fireEvent.click(button)

    await waitFor(() => {
      expect(screen.getByText('מוצר לא זמין')).toBeInTheDocument()
    })
  })

  it('disables buttons while loading', async () => {
    mockAddToCart.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ ok: true, cart: {} as any }), 100)),
    )
    render(<WishlistCard entry={mockEntry} />)

    const moveButton = screen.getByText('העבר לעגלה')
    fireEvent.click(moveButton)

    await waitFor(() => {
      expect(moveButton).toBeDisabled()
    })
  })

  it('calls toggleWishlist when remove button is clicked', async () => {
    mockToggleWishlist.mockResolvedValue({ ok: true, saved: false })
    render(<WishlistCard entry={mockEntry} />)

    const removeButton = screen.getByLabelText('הסר מרשימת המשאלות')
    fireEvent.click(removeButton)

    await waitFor(() => {
      expect(mockToggleWishlist).toHaveBeenCalledWith('test-product-123')
    })
  })

  it('shows success message when remove succeeds', async () => {
    mockToggleWishlist.mockResolvedValue({ ok: true, saved: false })
    render(<WishlistCard entry={mockEntry} />)

    const removeButton = screen.getByLabelText('הסר מרשימת המשאלות')
    fireEvent.click(removeButton)

    await waitFor(() => {
      expect(screen.getByText('הוסר מרשימת המשאלות')).toBeInTheDocument()
    })
  })

  it('shows error message when remove fails', async () => {
    mockToggleWishlist.mockResolvedValue({ ok: false, error: 'שגיאה בהסרה' })
    render(<WishlistCard entry={mockEntry} />)

    const removeButton = screen.getByLabelText('הסר מרשימת המשאלות')
    fireEvent.click(removeButton)

    await waitFor(() => {
      expect(screen.getByText('שגיאה בהסרה')).toBeInTheDocument()
    })
  })

  it('calls onRemove callback when item is successfully removed', async () => {
    mockToggleWishlist.mockResolvedValue({ ok: true, saved: false })
    const onRemove = vi.fn()
    render(<WishlistCard entry={mockEntry} onRemove={onRemove} />)

    const removeButton = screen.getByLabelText('הסר מרשימת המשאלות')
    fireEvent.click(removeButton)

    await waitFor(
      () => {
        expect(onRemove).toHaveBeenCalled()
      },
      { timeout: 1000 },
    )
  })

  it('renders correct button text while loading', async () => {
    mockAddToCart.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ ok: true, cart: {} as any }), 100)),
    )
    render(<WishlistCard entry={mockEntry} />)

    const moveButton = screen.getByText('העבר לעגלה')
    fireEvent.click(moveButton)

    await waitFor(() => {
      expect(screen.getByText('מוסיף...')).toBeInTheDocument()
    })
  })

  it('handles missing price gracefully', () => {
    const entryNoPrice: WishlistEntry = {
      ...mockEntry,
      product: {
        ...mockEntry.product!,
        price_ils: null,
      },
    }
    render(<WishlistCard entry={entryNoPrice} />)
    expect(screen.queryByText(/₪/)).not.toBeInTheDocument()
  })
})
