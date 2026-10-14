import { WISHLIST_STORAGE_KEY, readGuestWishlist } from '@/lib/wishlist/guest-storage'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import WishlistHeart from './WishlistHeart'
import { WishlistProvider } from './WishlistProvider'

let authed = false
vi.mock('@/components/cart/CartProvider', () => ({ useCartAuth: () => authed }))

const toggle = vi.fn()
const ids = vi.fn()
const merge = vi.fn()
const remove = vi.fn()
vi.mock('@/server/actions/reviews', () => ({ toggleWishlist: (id: string) => toggle(id) }))
vi.mock('@/server/actions/wishlist', () => ({
  getMyWishlistProductIds: () => ids(),
  mergeGuestWishlist: (list: string[]) => merge(list),
  removeFromWishlist: (id: string) => remove(id),
}))

const A = '00000000-0000-4000-8000-00000000000a'
const B = '00000000-0000-4000-8000-00000000000b'
const seedGuest = (...list: string[]) =>
  window.localStorage.setItem(
    WISHLIST_STORAGE_KEY,
    JSON.stringify({ v: 1, productIds: list, updatedAt: new Date(0).toISOString() }),
  )

function renderHearts() {
  return render(
    <WishlistProvider>
      <WishlistHeart productId={A} productName="מוצר א" />
      <WishlistHeart productId={B} productName="מוצר ב" />
    </WishlistProvider>,
  )
}
const heart = (name: string) => screen.getByRole('button', { name: new RegExp(name) })

beforeEach(() => {
  authed = false
  window.localStorage.clear()
  for (const mock of [toggle, ids, merge, remove]) mock.mockReset()
  ids.mockResolvedValue([])
})
afterEach(cleanup)

describe('wishlist hearts', () => {
  it('renders no heart outside the provider', () => {
    const { container } = render(<WishlistHeart productId={A} />)
    expect(container.innerHTML).toBe('')
  })

  it('signed out: a press saves to this browser and asks the server nothing', async () => {
    renderHearts()
    fireEvent.click(heart('מוצר א'))
    await waitFor(() => expect(heart('מוצר א').getAttribute('aria-pressed')).toBe('true'))
    expect(heart('מוצר ב').getAttribute('aria-pressed')).toBe('false')
    expect(readGuestWishlist().productIds).toEqual([A])
    expect(toggle).not.toHaveBeenCalled()

    fireEvent.click(heart('מוצר א'))
    await waitFor(() => expect(heart('מוצר א').getAttribute('aria-pressed')).toBe('false'))
    expect(readGuestWishlist().productIds).toEqual([])
  })

  it('signed out: paints what the browser already holds', async () => {
    seedGuest(B)
    renderHearts()
    await waitFor(() => expect(heart('מוצר ב').getAttribute('aria-pressed')).toBe('true'))
  })

  it('signed in: one read paints every heart', async () => {
    authed = true
    ids.mockResolvedValue([A])
    renderHearts()
    await waitFor(() => expect(heart('מוצר א').getAttribute('aria-pressed')).toBe('true'))
    expect(ids).toHaveBeenCalledTimes(1)
    expect(merge).not.toHaveBeenCalled()
  })

  it('signed in with a guest list: merges it, then clears the browser copy', async () => {
    authed = true
    seedGuest(B)
    merge.mockResolvedValue({ ok: true, merged: 1, ids: [B, A] })
    renderHearts()
    await waitFor(() => expect(heart('מוצר ב').getAttribute('aria-pressed')).toBe('true'))
    expect(merge).toHaveBeenCalledWith([B])
    expect(heart('מוצר א').getAttribute('aria-pressed')).toBe('true')
    expect(readGuestWishlist().productIds).toEqual([])
  })

  it('a refused merge keeps the browser copy', async () => {
    authed = true
    seedGuest(B)
    merge.mockResolvedValue({ ok: false, merged: 0, ids: [] })
    renderHearts()
    await waitFor(() => expect(merge).toHaveBeenCalled())
    expect(readGuestWishlist().productIds).toEqual([B])
  })

  it('signed in: a refused save rolls the heart back and says why', async () => {
    authed = true
    toggle.mockResolvedValue({ ok: false, error: 'רשימת המועדפים מלאה (100 מוצרים).' })
    renderHearts()
    await waitFor(() => expect(ids).toHaveBeenCalled())
    await act(async () => {
      fireEvent.click(heart('מוצר א'))
    })
    await waitFor(() => expect(screen.getByText('רשימת המועדפים מלאה (100 מוצרים).')).toBeTruthy())
    expect(heart('מוצר א').getAttribute('aria-pressed')).toBe('false')
  })

  it('signed in: a confirmed save stays, and only that heart changes', async () => {
    authed = true
    toggle.mockResolvedValue({ ok: true, saved: true })
    renderHearts()
    await waitFor(() => expect(ids).toHaveBeenCalled())
    await act(async () => {
      fireEvent.click(heart('מוצר ב'))
    })
    await waitFor(() => expect(heart('מוצר ב').getAttribute('aria-pressed')).toBe('true'))
    expect(toggle).toHaveBeenCalledWith(B)
    expect(heart('מוצר א').getAttribute('aria-pressed')).toBe('false')
  })
})
