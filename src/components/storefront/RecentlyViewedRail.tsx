'use client'

import ProductCard, { type Product } from '@/components/ProductCard'
import ProductDealCard from '@/components/ProductDealCard'
import { readRecentlyViewed, recordRecentlyViewed } from '@/lib/recently-viewed/guest-storage'
import { getRecentlyViewedProducts } from '@/server/actions/recently-viewed'
import { useEffect, useState } from 'react'

/**
 * "נצפו לאחרונה" -- the products this shopper's OWN browser remembers
 * viewing, read back from `localStorage` and re-checked against the live
 * catalogue before anything renders.
 *
 * Ported from the production branch (closeout L10, row 5), where it sits on
 * the product page only. The home placement is new here.
 *
 * A CLIENT COMPONENT FOR A REASON. The id list is per-browser and cannot be
 * read while a page is being statically prerendered. So this reads and writes
 * entirely after mount and renders nothing until then: server and first paint
 * both render null, and there is no hydration mismatch to reconcile.
 *
 * TWO PLACEMENTS, ONE LIST.
 *
 *   product   Given the product being viewed. Reads the list BEFORE recording
 *             this view, so a product never appears in its own rail, then
 *             records it. This is the only place a view is recorded.
 *   home      Reads only. Rendered BELOW the deals grid, and the position is
 *             the point: the rail appears after mount, so anything under it
 *             moves when it does. Under the grid that is the footer, which is
 *             off screen; above the grid it would be thirty-two cards on a
 *             returning shopper's first paint.
 */

type Props = { placement: 'product'; productId: string } | { placement: 'home' }

const TITLE = 'נצפו לאחרונה'

/** One row of the home grid at its widest. A longer history is on the product page. */
const HOME_LIMIT = 4

export default function RecentlyViewedRail(props: Props) {
  const [products, setProducts] = useState<Product[]>([])
  const productId = props.placement === 'product' ? props.productId : null

  useEffect(() => {
    let cancelled = false

    const priorIds = readRecentlyViewed().filter((id) => id !== productId)
    if (productId) recordRecentlyViewed(productId)

    if (priorIds.length === 0) return

    void getRecentlyViewedProducts(priorIds).then((result) => {
      if (!cancelled) setProducts(result)
    })
    return () => {
      cancelled = true
    }
  }, [productId])

  if (products.length === 0) return null

  if (props.placement === 'home') {
    return (
      <section
        aria-label={TITLE}
        data-testid="recently-viewed"
        className="mx-auto w-full max-w-deals px-deals-pad pb-deals-footer-gap md:px-deals-pad-md xl:px-0"
      >
        <h2 className="mb-4 text-xl font-medium">{TITLE}</h2>
        <div className="jet-listing-grid-deals bg-white">
          {products.slice(0, HOME_LIMIT).map((product) => (
            <div key={product.id} className="jet-listing-grid-deals__item">
              <ProductDealCard product={product} />
            </div>
          ))}
        </div>
      </section>
    )
  }

  return (
    <section className="pdp-related" data-testid="recently-viewed">
      <h2 className="pdp-related__title">{TITLE}</h2>
      <div className="pdp-related__grid">
        {products.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>
    </section>
  )
}
