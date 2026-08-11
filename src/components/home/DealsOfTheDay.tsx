import ProductDealCard from '@/components/ProductDealCard'
import { KE_LIVE_DEALS } from '@/lib/ke-live-deals-data'

/** refs/ke_live_singlefile.html — jet-listing-grid faf8583, 4 columns desktop, no section title */
export default async function DealsOfTheDay() {
  // Pixel parity: all 32 cards from singlefile only, no DB merge (different images/order = diff).
  const products = KE_LIVE_DEALS

  return (
    // live: grid box x=145 w=1150 at 1440px viewport -> exact 1150px container
    <section aria-label="מוצרים מובילים" className="mx-auto w-full max-w-deals pt-deals-top pb-6">
      <div className="jet-listing-grid-deals bg-white">
        {products.map((product) => (
          <div key={product.id} className="jet-listing-grid-deals__item">
            <ProductDealCard product={product} />
          </div>
        ))}
      </div>
    </section>
  )
}
