'use client'

import ProductCard, { type Product } from '@/components/ProductCard'
import { t } from '@/lib/i18n/messages'
import { readRecentlyViewed, recordRecentlyViewed } from '@/lib/recently-viewed/guest-storage'
import { getRecentlyViewedProducts } from '@/server/actions/recently-viewed'
import { useEffect, useState } from 'react'

/**
 * "נצפו לאחרונה" -- the products this shopper's OWN browser remembers
 * viewing, read back from `localStorage` and re-checked against the live
 * catalogue before anything renders. Electro v7's product template carries
 * the same widget; live does not, and this is the one place on the product
 * page where that gap is closed rather than left, because it costs nothing
 * shown on the cached page -- see the effect below for why.
 *
 * A CLIENT COMPONENT FOR A REASON. The id list is per-browser and cannot be
 * read while this page is being statically prerendered; reading it inside the
 * cached tree the way `ProductInfo`'s `scarcitySlot`/`proofSlot` do would work
 * for the STOCK question (per-product, answerable server-side) but not for
 * this one (per-VISITOR, answerable only in their own browser). So this reads
 * and writes entirely after mount, same as `WishlistHeart`, and renders
 * nothing until then -- server and first paint both render null, so there is
 * no hydration mismatch to reconcile.
 */
export default function RecentlyViewedRail({ productId }: { productId: string }) {
  const [products, setProducts] = useState<Product[]>([])

  useEffect(() => {
    let cancelled = false

    // Read BEFORE recording, so this product's own view this visit never
    // shows up inside its own "recently viewed" rail.
    const priorIds = readRecentlyViewed().filter((id) => id !== productId)
    recordRecentlyViewed(productId)

    if (priorIds.length === 0) return

    void getRecentlyViewedProducts(priorIds).then((result) => {
      if (!cancelled) setProducts(result)
    })
    return () => {
      cancelled = true
    }
  }, [productId])

  if (products.length === 0) return null

  return (
    <section className="pdp-related" data-testid="recently-viewed">
      <h2 className="pdp-related__title">{t('pdp.recentlyViewed')}</h2>
      <div className="pdp-related__grid">
        {products.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>
    </section>
  )
}
