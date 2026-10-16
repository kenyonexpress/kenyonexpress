import type { Product } from '@/components/ProductCard'
import { ProductsGridSkeleton } from '@/components/ProductCardSkeleton'
import ProductDealCard from '@/components/ProductDealCard'
import dealBlurs from '@/lib/deal-blurs.json'
import { KE_LIVE_DEALS } from '@/lib/ke-live-deals-data'
import { Suspense } from 'react'

/**
 * refs/ke_live_home.html — jet-listing-grid faf8583. No section title.
 * (The old comment cited ke_live_singlefile.html, retired in 62eb74956.)
 *
 * THE GRID IS INSET FROM THE VIEWPORT BY A DIFFERENT AMOUNT AT EACH WIDTH, and
 * this section had no horizontal padding at all, so below 1440 the cards ran
 * edge to edge. Measured off refs/ke_live_computed.json:
 *
 *   width   grid box        inset each side
 *   ------  --------------  ---------------
 *   380     x25   w330      25
 *   768     x49   w670      49
 *   1440    x145  w1150     145 (max-w-deals 1150 + mx-auto lands this)
 *
 * So the padding is only needed below the point where the 1150 cap takes over;
 * `xl:px-0` hands it back to the cap. The column count itself lives in
 * src/styles/product-card-deals.css, which carries the measurement table.
 */
function DealsGrid() {
  const products = KE_LIVE_DEALS

  return (
    <div className="jet-listing-grid-deals bg-white">
      {products.map((product) => {
        const thumb =
          Array.isArray(product.images) && typeof product.images[0] === 'string'
            ? (product.images[0] as string)
            : null
        const blurDataURL =
          thumb && dealBlurs[thumb as keyof typeof dealBlurs]
            ? dealBlurs[thumb as keyof typeof dealBlurs]
            : null
        const assets = thumb
          ? {
              [thumb]: {
                alt: product.name_he,
                blurDataURL,
              },
            }
          : undefined

        return (
          <div key={product.id} className="jet-listing-grid-deals__item">
            <ProductDealCard product={(assets ? { ...product, assets } : product) as Product} />
          </div>
        )
      })}
    </div>
  )
}

export default function DealsOfTheDay() {
  return (
    <section
      aria-label="מוצרים מובילים"
      className="mx-auto w-full max-w-deals px-deals-pad pt-deals-top pb-deals-footer-gap md:px-deals-pad-md xl:px-0"
    >
      <Suspense fallback={<ProductsGridSkeleton count={KE_LIVE_DEALS.length} />}>
        <DealsGrid />
      </Suspense>
    </section>
  )
}
