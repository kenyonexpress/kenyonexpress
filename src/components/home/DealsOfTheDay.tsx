import ProductDealCard from '@/components/ProductDealCard'
import { UNKNOWN_DEAL_TARGET, loadDealTargets } from '@/lib/deal-targets'
import { KE_LIVE_DEALS } from '@/lib/ke-live-deals-data'

/** refs/ke_live_singlefile.html — jet-listing-grid faf8583, 4 columns desktop, no section title */
export default async function DealsOfTheDay() {
  // Pixel parity: all 32 cards from singlefile only, no DB merge (different images/order = diff).
  const products = KE_LIVE_DEALS
  // The one thing the database IS asked for here: which of live's 32 hrefs this
  // catalogue can actually answer, and the uuid behind each. Cards, order,
  // images and prices all still come from the fixture, so nothing this returns
  // can move a pixel. See lib/deal-targets.ts.
  const targets = await loadDealTargets()

  return (
    // The grid is narrower than the viewport at every width, and by a different
    // amount at each. Measured off ke_live_computed home, `.jet-listing-grid__items`:
    //
    //   380  -> x=25  w=330   (100% - 50px)
    //   768  -> x=49  w=670   (a fixed box, live's Bootstrap container is 720 here)
    //   1440 -> x=145 w=1150  (--container-deals)
    //
    // Only the 1440 line was here before, so below lg the grid ran edge to edge:
    // 768px of cards against live's 670, which put every card image, badge and
    // price on different pixels for the whole 8000px of grid.
    <section
      aria-label="מוצרים מובילים"
      className="mx-auto w-[calc(100%-50px)] max-w-deals pt-deals-top pb-6 md:w-[670px] lg:w-full"
    >
      <div className="jet-listing-grid-deals bg-white">
        {products.map((product) => (
          <div key={product.id} className="jet-listing-grid-deals__item">
            <ProductDealCard
              product={product}
              target={targets[product.slug] ?? UNKNOWN_DEAL_TARGET}
            />
          </div>
        ))}
      </div>
    </section>
  )
}
