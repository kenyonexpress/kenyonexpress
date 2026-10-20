import { CartProvider } from '@/components/cart/CartProvider'
import { KE_LIVE_DEALS, KE_LIVE_DEAL_TABLET_SQUARE } from '@/lib/ke-live-deals-data'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import ProductDealCard from './ProductDealCard'

describe('ProductDealCard tablet thumbnail shape', () => {
  it('flags only the cards whose reference thumbnail is square at 768', () => {
    for (const product of KE_LIVE_DEALS.slice(0, 8)) {
      const html = renderToStaticMarkup(
        <CartProvider>
          <ProductDealCard product={product} />
        </CartProvider>,
      )
      const flagged = html.includes('data-thumb-md="square"')
      expect(flagged, product.id).toBe(KE_LIVE_DEAL_TABLET_SQUARE.has(product.id))
    }
  })

  it('knows the one measured card', () => {
    expect([...KE_LIVE_DEAL_TABLET_SQUARE]).toEqual(['ke-deal-8893'])
  })
})
