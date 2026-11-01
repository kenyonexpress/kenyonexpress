import {
  RECENTLY_VIEWED_STORAGE_KEY,
  readRecentlyViewed,
} from '@/lib/recently-viewed/guest-storage'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import RecentlyViewedRail from './RecentlyViewedRail'

const load = vi.fn()
vi.mock('@/server/actions/recently-viewed', () => ({
  getRecentlyViewedProducts: (ids: string[]) => load(ids),
}))
vi.mock('@/components/ProductCard', () => ({
  default: ({ product }: { product: { id: string } }) => (
    <div data-testid="pdp-card">{product.id}</div>
  ),
}))
vi.mock('@/components/ProductDealCard', () => ({
  default: ({ product }: { product: { id: string } }) => (
    <div data-testid="home-card">{product.id}</div>
  ),
}))

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const product = (n: number) => ({
  id: id(n),
  slug: `p${n}`,
  name_he: `p${n}`,
  kenyon_price: 10,
  images: [],
  stock_quantity: null,
})
const seed = (...ns: number[]) =>
  window.localStorage.setItem(
    RECENTLY_VIEWED_STORAGE_KEY,
    JSON.stringify({ v: 1, productIds: ns.map(id) }),
  )

beforeEach(() => {
  window.localStorage.clear()
  load.mockReset()
  load.mockImplementation(async (ids: string[]) =>
    ids.map((value) => product(Number(value.slice(-4)))),
  )
})
afterEach(cleanup)

describe('RecentlyViewedRail', () => {
  it('renders nothing and asks the server nothing on a first visit', () => {
    const { container } = render(<RecentlyViewedRail placement="home" />)
    expect(container.innerHTML).toBe('')
    expect(load).not.toHaveBeenCalled()
  })

  it('on a product page, records the view and leaves the product out of its own rail', async () => {
    seed(2, 1)
    render(<RecentlyViewedRail placement="product" productId={id(1)} />)
    await waitFor(() => expect(screen.getAllByTestId('pdp-card')).toHaveLength(1))
    expect(load).toHaveBeenCalledWith([id(2)])
    expect(readRecentlyViewed()).toEqual([id(1), id(2)])
  })

  it('on the home page, shows the history without recording anything', async () => {
    seed(3, 2, 1)
    render(<RecentlyViewedRail placement="home" />)
    await waitFor(() => expect(screen.getAllByTestId('home-card')).toHaveLength(3))
    expect(screen.getByRole('heading', { name: 'נצפו לאחרונה' })).toBeTruthy()
    expect(readRecentlyViewed()).toEqual([id(3), id(2), id(1)])
  })

  it('on the home page, shows one row at most', async () => {
    seed(6, 5, 4, 3, 2, 1)
    render(<RecentlyViewedRail placement="home" />)
    await waitFor(() => expect(screen.getAllByTestId('home-card')).toHaveLength(4))
    expect(screen.getAllByTestId('home-card').map((node) => node.textContent)).toEqual([
      id(6),
      id(5),
      id(4),
      id(3),
    ])
  })

  it('stays empty when none of the remembered products is still on sale', async () => {
    seed(2, 1)
    load.mockResolvedValue([])
    const { container } = render(<RecentlyViewedRail placement="home" />)
    await waitFor(() => expect(load).toHaveBeenCalled())
    expect(container.innerHTML).toBe('')
  })
})
