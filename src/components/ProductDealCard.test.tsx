import ProductDealCard from '@/components/ProductDealCard'
import { CartProvider } from '@/components/cart/CartProvider'
import { CITIES } from '@/lib/geo/cities'
import type { ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

/**
 * The meta line of a deal card: the category, then the city, on ONE row.
 *
 * Rendered to static markup under a `CartProvider`, the same way
 * `ProductRail.test.tsx` renders its cards: the add-to-cart island reads the
 * cart from context and throws without one.
 */
const render = (element: ReactElement) =>
  renderToStaticMarkup(<CartProvider>{element}</CartProvider>)

const knownCity = CITIES[0]
if (!knownCity) throw new Error('the city table is empty')

const product = {
  id: '11111111-1111-4111-8111-111111111111',
  slug: 'deal',
  name_he: 'deal',
  kenyon_price: 50,
  full_price: 100,
  images: ['/images/products/x.webp'],
  stock_quantity: 3,
  category: { name_he: 'cat', slug: 'cat' },
}

describe('ProductDealCard meta line', () => {
  it('shows the category alone when the deal has no city, as the capture did', () => {
    const html = render(<ProductDealCard product={{ ...product, city: null }} />)
    expect(html).toContain('p_con__category')
    expect(html).not.toContain('p_con__city')
    expect(html).not.toContain(' · ')
  })

  it('shows the city after the category on the same meta row', () => {
    const html = render(<ProductDealCard product={{ ...product, city: knownCity.name }} />)
    const meta = html.match(/<div class="p_con__meta">(.*?)<\/div>/)?.[1] ?? ''
    expect(meta).toContain('p_con__category')
    expect(meta).toContain(`<span class="p_con__city"> · ${knownCity.name}</span>`)
  })

  it('normalises a value that names a known city to its canonical spelling', () => {
    // "<city> יפו" is the prefix case cityByName documents; the card prints
    // the table's name for it, not the operator's longer text.
    const html = render(<ProductDealCard product={{ ...product, city: `${knownCity.name} יפו` }} />)
    expect(html).toContain(`> · ${knownCity.name}</span>`)
    expect(html).not.toContain(`${knownCity.name} יפו`)
  })

  it('keeps an unknown city as typed rather than hiding it', () => {
    const html = render(<ProductDealCard product={{ ...product, city: '  Somewhere ' }} />)
    expect(html).toContain('> · Somewhere</span>')
  })

  it('renders the city on its own when the deal has no category', () => {
    const html = render(
      <ProductDealCard product={{ ...product, category: null, city: knownCity.name }} />,
    )
    expect(html).toContain(
      `<div class="p_con__meta"><span class="p_con__city">${knownCity.name}</span></div>`,
    )
  })

  it('renders no meta row at all with neither, so the card keeps its capture height', () => {
    const html = render(<ProductDealCard product={{ ...product, category: null, city: null }} />)
    expect(html).not.toContain('p_con__meta')
  })
})
