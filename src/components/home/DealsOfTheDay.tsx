import ProductDealCard from '@/components/ProductDealCard'
import { KE_LIVE_DEALS } from '@/lib/ke-live-deals-data'

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
export default async function DealsOfTheDay() {
  // Pixel parity: all 32 cards from the reference only, no DB merge (different
  // images/order = a content difference wearing a fidelity number).
  const products = KE_LIVE_DEALS

  return (
    <section
      aria-label="מוצרים מובילים"
      className="mx-auto w-full max-w-deals px-[25px] pt-deals-top pb-6 md:px-[49px] xl:px-0"
    >
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
