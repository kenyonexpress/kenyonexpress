import ProductCard from '@/components/ProductCard'
import { KE_LIVE_DEALS } from '@/lib/ke-live-deals-data'

/** refs/ke_live_singlefile.html — jet-listing-grid faf8583, 4 columns desktop, no section title */
export default async function DealsOfTheDay() {
  // Pixel parity: all 32 cards from singlefile only, no DB merge (different images/order = diff).
  const products = KE_LIVE_DEALS

  return (
    // live: grid box x=145 w=1150 at 1440px viewport -> exact 1150px container
    <section aria-label="מוצרים מובילים" className="mx-auto w-full max-w-[1150px] pt-[15px] pb-6">
      <div className="jet-listing-grid-deals bg-white">
        {products.map((product) => (
          <div key={product.id} className="jet-listing-grid-deals__item">
            <ProductCard product={product} variant="deals" />
          </div>
        ))}
      </div>
    </section>
  )
}
