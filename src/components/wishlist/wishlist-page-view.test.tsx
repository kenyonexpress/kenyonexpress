import { useWishlistStore } from '@/lib/wishlist/client-store'
import type { WishlistViewItem, WishlistViewState } from '@/server/actions/wishlist'
import { act, createEvent, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * UX20 (14.10.2026): the wishlist page as a product grid with a toolbar.
 *
 * Measured before (logs/ux20/before.json): a one-column list of rows at 380
 * with an 80px thumbnail, a toolbar of one button (move all, only from two
 * movable products), no share control (production has not applied 248, so
 * the share card rendered nothing), a remove that froze every button on the
 * page and left no undo and no announcement, and a move that took the row
 * out within a frame.
 *
 * Pinned here: the grid and the count; the share button on the toolbar in
 * each of its three states (not open, mint-then-copy, copy); the remove
 * press reaching the server only after the card's exit, then the undo in
 * its toast putting the product back where it was; a move asking the cart
 * first and announcing; a refused removal restoring the card; "move all"
 * leaving the refused product saved.
 */

const getMyWishlistView = vi.hoisted(() => vi.fn())
const removeFromWishlist = vi.hoisted(() => vi.fn())
const setWishlistShare = vi.hoisted(() => vi.fn())
const toggleWishlist = vi.hoisted(() => vi.fn())
const addToCart = vi.hoisted(() => vi.fn())
const track = vi.hoisted(() => vi.fn())
const toast = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
}))

vi.mock('@/server/actions/wishlist', () => ({
  getMyWishlistView: (...args: unknown[]) => getMyWishlistView(...args),
  getMyWishlistIds: vi.fn().mockResolvedValue({ signedIn: true, ids: [] }),
  removeFromWishlist: (...args: unknown[]) => removeFromWishlist(...args),
  setWishlistShare: (...args: unknown[]) => setWishlistShare(...args),
}))
vi.mock('@/server/actions/reviews', () => ({
  toggleWishlist: (...args: unknown[]) => toggleWishlist(...args),
}))
vi.mock('@/components/cart/CartProvider', () => ({
  useCart: () => ({ addToCart, isPending: false }),
}))
vi.mock('@/lib/analytics/tracker', () => ({ track }))
vi.mock('sonner', () => ({ toast }))
vi.mock('@/components/account/WishlistAlertPrefs', () => ({
  default: () => <div data-testid="alert-prefs" />,
}))

import WishlistPageView from './WishlistPageView'

const FRIDGE: WishlistViewItem = {
  productId: '11111111-1111-4111-8111-111111111111',
  savedAt: '2026-10-12T10:00:00.000Z',
  name: 'מקרר',
  slug: 'fridge',
  priceIls: 2500,
  fullPriceIls: 3000,
  image: null,
  available: true,
  soldOut: false,
}
const OVEN: WishlistViewItem = {
  ...FRIDGE,
  productId: '22222222-2222-4222-8222-222222222222',
  name: 'תנור',
  slug: 'oven',
  priceIls: 900,
  fullPriceIls: null,
}
const KETTLE: WishlistViewItem = {
  ...FRIDGE,
  productId: '33333333-3333-4333-8333-333333333333',
  name: 'קומקום',
  slug: 'kettle',
  priceIls: 120,
  fullPriceIls: null,
  available: false,
  soldOut: true,
}

function viewOf(
  items: WishlistViewItem[],
  share: Extract<WishlistViewState, { signedIn: true }>['share'] = { available: false },
): WishlistViewState {
  return { signedIn: true, items, share }
}

function card(name: string): HTMLElement {
  return screen
    .getByRole('button', { name: `הסרת ${name} מהרשימה` })
    .closest('article') as HTMLElement
}

function endExit(el: HTMLElement) {
  const event = createEvent.animationEnd(el)
  Object.defineProperty(event, 'animationName', { value: 'wishlist-card-leave' })
  fireEvent(el, event)
}

async function renderPage(view: WishlistViewState) {
  getMyWishlistView.mockResolvedValue(view)
  render(<WishlistPageView embedded />)
  await screen.findByRole('list', { name: 'המוצרים השמורים' }).catch(() => null)
}

beforeEach(() => {
  getMyWishlistView.mockReset()
  removeFromWishlist.mockReset().mockResolvedValue({ ok: true })
  setWishlistShare.mockReset()
  toggleWishlist.mockReset().mockResolvedValue({ ok: true, saved: true })
  addToCart.mockReset().mockResolvedValue(true)
  track.mockClear()
  toast.success.mockClear()
  toast.error.mockClear()
  toast.info.mockClear()
  useWishlistStore.getState().reset()
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
    configurable: true,
  })
})

describe('the grid and the toolbar', () => {
  it('shows the loading cells, then the grid with one card per product and the count', async () => {
    getMyWishlistView.mockReturnValue(new Promise(() => {}))
    render(<WishlistPageView embedded />)
    expect(screen.getByRole('list', { name: 'טוען את הרשימה' })).toHaveAttribute(
      'aria-busy',
      'true',
    )
  })

  it('renders the grid, the count and the two actions on every card', async () => {
    await renderPage(viewOf([FRIDGE, OVEN, KETTLE]))
    const list = screen.getByRole('list', { name: 'המוצרים השמורים' })
    expect(list).toHaveClass('wishlist-grid')
    expect(list.querySelectorAll('li.wishlist-grid__item')).toHaveLength(3)
    expect(screen.getByText('3 מוצרים שמורים')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'העברת הכל לסל (2)' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'אזל מהמלאי' })).toBeDisabled()
    // The store now knows the three ids: the header count agrees.
    expect(useWishlistStore.getState().ids.size).toBe(3)
  })

  it('offers "move all" only from two movable products', async () => {
    await renderPage(viewOf([FRIDGE, KETTLE]))
    expect(screen.queryByRole('button', { name: /העברת הכל/ })).toBeNull()
  })

  it('the empty state offers the catalogue and the coupons, and keeps the alert card', async () => {
    await renderPage(viewOf([]))
    expect(screen.getByText('עוד לא שמרת מוצרים')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'לכל המוצרים' })).toHaveAttribute('href', '/products')
    expect(screen.getByRole('link', { name: 'לקופונים' })).toHaveAttribute('href', '/coupons')
    expect(screen.getByTestId('alert-prefs')).toBeInTheDocument()
  })

  it('signed out is a page with a sign-in that returns here', async () => {
    await renderPage({ signedIn: false })
    expect(screen.getByRole('link', { name: 'התחברות' })).toHaveAttribute(
      'href',
      '/login?next=%2Faccount%2Fwishlist',
    )
  })
})

describe('the share button on the toolbar', () => {
  it('while 248 is not applied it explains in a toast and the card is absent', async () => {
    await renderPage(viewOf([FRIDGE]))
    const share = screen.getByRole('button', { name: 'שיתוף הרשימה' })
    expect(share).toHaveAttribute('data-share', 'unavailable')
    expect(share).toHaveAttribute('aria-disabled', 'true')
    await act(async () => {
      fireEvent.click(share)
    })
    expect(toast.info).toHaveBeenCalledWith('שיתוף הרשימה עוד לא פתוח. נסו שוב בקרוב.')
    expect(setWishlistShare).not.toHaveBeenCalled()
    expect(screen.queryByRole('heading', { name: 'שיתוף הרשימה' })).toBeNull()
  })

  it('with no link yet, one press mints it, copies it, and the card below shows it', async () => {
    const token = 'A'.repeat(32)
    setWishlistShare.mockResolvedValue({
      ok: true,
      share: { available: true, token, enabled: true },
    })
    await renderPage(viewOf([FRIDGE], { available: true, token: null, enabled: false }))
    const share = screen.getByRole('button', { name: 'שיתוף הרשימה' })
    expect(share).toHaveAttribute('data-share', 'off')
    await act(async () => {
      fireEvent.click(share)
    })
    expect(setWishlistShare).toHaveBeenCalledWith('enable')
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      `${window.location.origin}/wishlist/shared/${token}`,
    )
    expect(toast.success).toHaveBeenCalledWith('הקישור הועתק')
    // The lifted state reached the card: it now shows the link field.
    expect(screen.getByRole('button', { name: 'שיתוף הרשימה' })).toHaveAttribute(
      'data-share',
      'live',
    )
    expect(
      screen.getByDisplayValue(`${window.location.origin}/wishlist/shared/${token}`),
    ).toBeInTheDocument()
  })

  it('with a live link, one press copies it without a server call', async () => {
    const token = 'B'.repeat(32)
    await renderPage(viewOf([FRIDGE], { available: true, token, enabled: true }))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'שיתוף הרשימה' }))
    })
    expect(setWishlistShare).not.toHaveBeenCalled()
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      `${window.location.origin}/wishlist/shared/${token}`,
    )
  })
})

describe('remove, with undo', () => {
  it('writes after the exit, announces, and the undo puts the product back in place', async () => {
    await renderPage(viewOf([FRIDGE, OVEN]))
    fireEvent.click(screen.getByRole('button', { name: 'הסרת מקרר מהרשימה' }))
    expect(card('מקרר')).toHaveAttribute('data-leaving', 'remove')
    // The other card is untouched: the busy state is per card.
    expect(screen.getByRole('button', { name: 'הסרת תנור מהרשימה' })).toBeEnabled()
    expect(removeFromWishlist).not.toHaveBeenCalled()

    await act(async () => {
      endExit(card('מקרר'))
    })
    await waitFor(() => expect(removeFromWishlist).toHaveBeenCalledWith(FRIDGE.productId))
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'הסרת מקרר מהרשימה' })).toBeNull(),
    )
    expect(screen.getByText('מוצר אחד שמור')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('מקרר הוסר מהרשימה')
    expect(toast.success).toHaveBeenCalledWith(
      'מקרר הוסר מהרשימה',
      expect.objectContaining({ action: expect.objectContaining({ label: 'ביטול' }) }),
    )

    const options = toast.success.mock.calls[0]?.[1] as { action: { onClick: () => void } }
    await act(async () => {
      options.action.onClick()
    })
    await waitFor(() => expect(toggleWishlist).toHaveBeenCalledWith(FRIDGE.productId))
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'הסרת מקרר מהרשימה' })).toBeInTheDocument(),
    )
    // Back at index 0, before the oven.
    const names = [...screen.getAllByRole('button', { name: /^הסרת/ })].map((b) =>
      b.getAttribute('aria-label'),
    )
    expect(names).toEqual(['הסרת מקרר מהרשימה', 'הסרת תנור מהרשימה'])
    expect(screen.getByRole('status')).toHaveTextContent('מקרר חזר לרשימה')
    expect(screen.getByText('2 מוצרים שמורים')).toBeInTheDocument()
  })

  it('a refused removal puts the card back and says why', async () => {
    removeFromWishlist.mockResolvedValue({ ok: false, error: 'ההסרה נכשלה. נסה שוב.' })
    await renderPage(viewOf([FRIDGE]))
    fireEvent.click(screen.getByRole('button', { name: 'הסרת מקרר מהרשימה' }))
    await act(async () => {
      endExit(card('מקרר'))
    })
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('ההסרה נכשלה. נסה שוב.'))
    expect(card('מקרר')).not.toHaveAttribute('data-leaving')
    expect(screen.getByRole('button', { name: 'הסרת מקרר מהרשימה' })).toBeEnabled()
    expect(screen.getByText('מוצר אחד שמור')).toBeInTheDocument()
  })
})

describe('move to cart', () => {
  it('asks the cart first, then leaves, then removes, and announces', async () => {
    await renderPage(viewOf([FRIDGE, OVEN]))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'העברת מקרר לסל' }))
    })
    expect(addToCart).toHaveBeenCalledWith(FRIDGE.productId, null, 1, 'מקרר')
    expect(track).toHaveBeenCalledWith('add_to_cart', {
      product_id: FRIDGE.productId,
      quantity: 1,
      variant_id: null,
    })
    expect(card('מקרר')).toHaveAttribute('data-leaving', 'move')
    expect(removeFromWishlist).not.toHaveBeenCalled()

    await act(async () => {
      endExit(card('מקרר'))
    })
    await waitFor(() => expect(removeFromWishlist).toHaveBeenCalledWith(FRIDGE.productId))
    await waitFor(() => expect(screen.queryByRole('button', { name: /מקרר/ })).toBeNull())
    expect(screen.getByRole('status')).toHaveTextContent('מקרר עבר לסל')
    // No undo on a move: the product is in the cart, not lost.
    expect(toast.success).not.toHaveBeenCalled()
  })

  it('a refused add keeps the product saved and reports nothing as a sale', async () => {
    addToCart.mockResolvedValue(false)
    await renderPage(viewOf([FRIDGE]))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'העברת מקרר לסל' }))
    })
    expect(track).not.toHaveBeenCalled()
    expect(removeFromWishlist).not.toHaveBeenCalled()
    expect(card('מקרר')).not.toHaveAttribute('data-leaving')
  })

  it('"move all" sends the movable ones and leaves a refused product saved', async () => {
    addToCart.mockImplementation(async (id: string) => id !== OVEN.productId)
    await renderPage(viewOf([FRIDGE, OVEN, KETTLE]))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'העברת הכל לסל (2)' }))
    })
    await waitFor(() => expect(removeFromWishlist).toHaveBeenCalledTimes(1))
    expect(removeFromWishlist).toHaveBeenCalledWith(FRIDGE.productId)
    expect(addToCart).not.toHaveBeenCalledWith(KETTLE.productId, null, 1, 'קומקום')
    await waitFor(() => expect(screen.getByText('2 מוצרים שמורים')).toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'הסרת תנור מהרשימה' })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('מוצר אחד עבר לסל')
    expect(toast.success).toHaveBeenCalledWith('מוצר אחד עבר לסל')
  })
})
