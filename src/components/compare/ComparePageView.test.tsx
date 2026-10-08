import { resetCompareHydrationForTests, useCompareStore } from '@/lib/compare/client-store'
import type { CompareViewItem } from '@/lib/compare/view'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ComparePageView from './ComparePageView'

const addToCart = vi.fn()
const getCompareView = vi.fn()
const track = vi.fn()
vi.mock('@/components/cart/CartProvider', () => ({ useCart: () => ({ addToCart }) }))
vi.mock('@/server/actions/compare', () => ({
  getCompareView: (...a: unknown[]) => getCompareView(...a),
}))
vi.mock('@/lib/analytics/tracker', () => ({ track: (...a: unknown[]) => track(...a) }))
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))
vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => {
    const { fill: _fill, ...rest } = props
    // biome-ignore lint/a11y/useAltText: the alt comes through props
    return <img {...(rest as React.ImgHTMLAttributes<HTMLImageElement>)} />
  },
}))

const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'

function item(over: Partial<CompareViewItem>): CompareViewItem {
  return {
    productId: A,
    name: 'ארוחה זוגית',
    slug: 'couple-meal',
    image: 'https://img/1.webp',
    priceIls: 80,
    fullPriceIls: 200,
    discountPercent: 60,
    available: true,
    soldOut: false,
    typeLabel: 'קופון',
    categoryName: 'מסעדות',
    categorySlug: 'restaurants-cafes',
    supplierName: 'הים הכחול',
    brand: null,
    sku: null,
    city: 'חיפה',
    cashbackPercent: 5,
    requiresShipping: false,
    shortDescription: null,
    highlights: [],
    attributes: [{ label: 'כשרות', value: 'מהדרין' }],
    ...over,
  }
}

beforeEach(() => {
  localStorage.clear()
  resetCompareHydrationForTests()
  addToCart.mockReset()
  getCompareView.mockReset()
  track.mockReset()
})

describe('ComparePageView', () => {
  it('shows the empty state without asking the server', async () => {
    render(<ComparePageView />)
    expect(await screen.findByText('עדיין אין מוצרים להשוואה')).toBeInTheDocument()
    expect(getCompareView).not.toHaveBeenCalled()
    expect(screen.getByRole('link', { name: 'לכל המוצרים' })).toHaveAttribute('href', '/products')
  })

  it('reads the columns once, in list order, with a sticky header per product', async () => {
    localStorage.setItem('ke_compare_v1', JSON.stringify({ state: { ids: [B, A] }, version: 0 }))
    getCompareView.mockResolvedValue({
      ok: true,
      items: [
        item({ productId: B, name: 'ארוחה משפחתית', priceIls: 120, city: 'תל אביב' }),
        item({}),
      ],
    })
    render(<ComparePageView />)
    const table = await screen.findByTestId('compare-table')
    expect(getCompareView).toHaveBeenCalledTimes(1)
    expect(getCompareView).toHaveBeenCalledWith([B, A])

    const heads = table.querySelectorAll('thead th')
    expect(heads).toHaveLength(3)
    for (const th of heads) {
      expect(th.className).toContain('sticky')
      expect(th.className).toContain('top-header-handheld')
      expect(th.className).toContain('xl:top-header-masthead')
    }
    expect(heads[1]?.textContent).toContain('ארוחה משפחתית')
    expect(heads[2]?.textContent).toContain('ארוחה זוגית')

    // A row that differs is marked; a row that agrees is not.
    const city = screen.getByRole('rowheader', { name: 'עיר' }).closest('tr')
    expect(city).toHaveAttribute('data-differs', 'true')
    const category = screen.getByRole('rowheader', { name: 'קטגוריה' }).closest('tr')
    expect(category).toHaveAttribute('data-differs', 'false')
  })

  it('hides the rows that agree behind the differences switch', async () => {
    localStorage.setItem('ke_compare_v1', JSON.stringify({ state: { ids: [A, B] }, version: 0 }))
    getCompareView.mockResolvedValue({
      ok: true,
      items: [item({}), item({ productId: B, name: 'ב', priceIls: 90 })],
    })
    render(<ComparePageView />)
    await screen.findByTestId('compare-table')
    expect(screen.getByRole('rowheader', { name: 'קטגוריה' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('checkbox', { name: 'הצג הבדלים בלבד' }))
    expect(screen.queryByRole('rowheader', { name: 'קטגוריה' })).not.toBeInTheDocument()
    expect(screen.getByRole('rowheader', { name: 'מחיר' })).toBeInTheDocument()
  })

  it('drops an id the catalogue no longer answers for', async () => {
    localStorage.setItem('ke_compare_v1', JSON.stringify({ state: { ids: [A, B] }, version: 0 }))
    getCompareView.mockResolvedValue({ ok: true, items: [item({})] })
    render(<ComparePageView />)
    await screen.findByTestId('compare-table')
    await waitFor(() => expect(useCompareStore.getState().ids).toEqual([A]))
  })

  it('removes a column locally and adds a product to the cart from its head', async () => {
    localStorage.setItem('ke_compare_v1', JSON.stringify({ state: { ids: [A, B] }, version: 0 }))
    getCompareView.mockResolvedValue({
      ok: true,
      items: [item({}), item({ productId: B, name: 'ב', available: false, soldOut: true })],
    })
    addToCart.mockResolvedValue(true)
    render(<ComparePageView />)
    await screen.findByTestId('compare-table')

    fireEvent.click(screen.getByRole('button', { name: 'הוסף את ארוחה זוגית לסל' }))
    await waitFor(() => expect(addToCart).toHaveBeenCalledWith(A, null, 1, 'ארוחה זוגית'))
    expect(track).toHaveBeenCalledWith('add_to_cart', {
      product_id: A,
      quantity: 1,
      variant_id: null,
    })
    // The sold-out column has no cart button, only the word.
    expect(screen.queryByRole('button', { name: 'הוסף את ב לסל' })).not.toBeInTheDocument()
    expect(screen.getAllByText('אזל מהמלאי').length).toBeGreaterThan(0)

    fireEvent.click(screen.getByRole('button', { name: 'הסר את ב מההשוואה' }))
    expect(useCompareStore.getState().ids).toEqual([A])
    await waitFor(() =>
      expect(screen.getByTestId('compare-table').querySelectorAll('thead th')).toHaveLength(2),
    )
    // A remove is local: no second read.
    expect(getCompareView).toHaveBeenCalledTimes(1)
  })

  it('says so when the read fails', async () => {
    localStorage.setItem('ke_compare_v1', JSON.stringify({ state: { ids: [A] }, version: 0 }))
    getCompareView.mockResolvedValue({ ok: false, error: 'x' })
    render(<ComparePageView />)
    expect(await screen.findByRole('alert')).toHaveTextContent('לא הצלחנו לטעון')
  })
})
