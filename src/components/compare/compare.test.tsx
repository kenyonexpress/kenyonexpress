import { readCompareList, writeCompareList } from '@/lib/compare/storage'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import CompareBar from './CompareBar'
import CompareTable from './CompareTable'
import CompareToggle from './CompareToggle'

const load = vi.fn()
vi.mock('@/server/actions/compare', () => ({ getCompareProducts: (ids: string[]) => load(ids) }))
vi.mock('@/components/cart/AddToCartButton', () => ({
  default: ({ productName }: { productName: string }) => (
    <button type="button">סל: {productName}</button>
  ),
}))

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const row = (n: number, price: number, full: number | null) => ({
  id: id(n),
  slug: `p${n}`,
  name_he: `מוצר ${n}`,
  kenyon_price: price,
  full_price: full,
  images: [],
  stock_quantity: null,
  short_description_he: null,
  coupon_expiry_days: null,
  category: null,
})

beforeEach(() => {
  window.localStorage.clear()
  load.mockReset()
})
afterEach(cleanup)

describe('picking products on a listing', () => {
  function renderListing(count: number) {
    return render(
      <>
        <CompareBar />
        {Array.from({ length: count }, (_, i) => (
          <CompareToggle key={id(i + 1)} productId={id(i + 1)} productName={`מוצר ${i + 1}`} />
        ))}
      </>,
    )
  }
  const toggle = (n: number) => screen.getByRole('button', { name: new RegExp(`: מוצר ${n}$`) })

  it('shows no bar until something is picked', () => {
    renderListing(2)
    expect(screen.queryByTestId('compare-bar')).toBeNull()
  })

  it('one pick asks for another; two picks link to the table', async () => {
    renderListing(3)
    fireEvent.click(toggle(1))
    await waitFor(() => expect(screen.getByText('מוצר אחד נבחר להשוואה')).toBeTruthy())
    expect(screen.queryByRole('link', { name: 'להשוואה' })).toBeNull()
    expect(toggle(1).getAttribute('aria-pressed')).toBe('true')

    fireEvent.click(toggle(2))
    await waitFor(() => expect(screen.getByText('2 מוצרים נבחרו להשוואה')).toBeTruthy())
    expect(screen.getByRole('link', { name: 'להשוואה' }).getAttribute('href')).toBe(
      '/products/compare',
    )
    expect(readCompareList()).toEqual([id(1), id(2)])
  })

  it('refuses a fifth product and says why', async () => {
    renderListing(5)
    for (const n of [1, 2, 3, 4]) fireEvent.click(toggle(n))
    await waitFor(() => expect(readCompareList()).toHaveLength(4))
    fireEvent.click(toggle(5))
    await waitFor(() => expect(screen.getByText(/אפשר להשוות עד 4 מוצרים/)).toBeTruthy())
    expect(toggle(5).getAttribute('aria-pressed')).toBe('false')
    expect(readCompareList()).toHaveLength(4)
  })

  it('clearing empties the list and every toggle', async () => {
    renderListing(2)
    fireEvent.click(toggle(1))
    fireEvent.click(toggle(2))
    await waitFor(() => expect(screen.getByTestId('compare-bar')).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: 'ניקוי' }))
    await waitFor(() => expect(screen.queryByTestId('compare-bar')).toBeNull())
    expect(toggle(1).getAttribute('aria-pressed')).toBe('false')
    expect(readCompareList()).toEqual([])
  })
})

describe('the comparison table', () => {
  it('says how to pick products when nothing is picked, and asks the server nothing', async () => {
    render(<CompareTable />)
    await waitFor(() => expect(screen.getByText('עדיין לא נבחרו מוצרים להשוואה.')).toBeTruthy())
    expect(load).not.toHaveBeenCalled()
  })

  it('lays the picks out as columns and marks the lowest price', async () => {
    writeCompareList([id(1), id(2)])
    load.mockResolvedValue([row(1, 100, 400), row(2, 60, null)])
    render(<CompareTable />)

    await waitFor(() => expect(screen.getAllByRole('columnheader')).toHaveLength(3))
    expect(load).toHaveBeenCalledWith([id(1), id(2)])
    // The first of the two rows whose header starts with the word: מחיר, then מחיר מלא.
    const priceRow = screen.getAllByRole('row', { name: /^מחיר / })[0] as HTMLElement
    expect(priceRow.textContent).toContain('המחיר הנמוך ביותר')
    expect(screen.getByRole('row', { name: /^חיסכון/ }).textContent).toContain('(75%)')
    expect(screen.getByRole('link', { name: 'מוצר 1' }).getAttribute('href')).toBe('/product/p1')
  })

  it('removing a column removes the pick and reloads without it', async () => {
    writeCompareList([id(1), id(2)])
    load.mockImplementation(async (ids: string[]) =>
      ids.map((value) => row(Number(value.slice(-2)), 50, null)),
    )
    render(<CompareTable />)
    await waitFor(() => expect(screen.getAllByRole('columnheader')).toHaveLength(3))

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'הסר מההשוואה: מוצר 1' }))
    })
    await waitFor(() => expect(screen.getAllByRole('columnheader')).toHaveLength(2))
    expect(readCompareList()).toEqual([id(2)])
  })

  it('shows the picks that still exist when one was withdrawn', async () => {
    writeCompareList([id(1), id(2)])
    load.mockResolvedValue([row(2, 60, null)])
    render(<CompareTable />)
    await waitFor(() => expect(screen.getAllByRole('columnheader')).toHaveLength(2))
    expect(screen.queryByText('מוצר 1')).toBeNull()
  })
})
