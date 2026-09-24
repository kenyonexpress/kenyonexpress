import ProductDealCard from '@/components/ProductDealCard'
import { FIXTURE_DEALS, type HomeDeal, homeDeals } from '@/lib/homepage/deals'

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
function DealsGrid({ products }: { products: readonly HomeDeal[] }) {
  return (
    <section
      aria-label="מוצרים מובילים"
      className="mx-auto w-full max-w-deals px-deals-pad pt-deals-top pb-deals-footer-gap md:px-deals-pad-md xl:px-0"
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

/**
 * The catalogue's own rows, in live's order, with the capture as fallback.
 * `lib/homepage/deals.ts` carries the reasoning; this file only paints.
 *
 * Until 2026-09-25 this rendered `KE_LIVE_DEALS` and nothing else, under a
 * note that a database merge would be "a content difference wearing a fidelity
 * number". The order is what made that true, and the order is now live's.
 * Measured on the same three frozen captures before and after the change:
 * see docs/UI-PARITY-REPORT.md for the rows dated 2026-09-25.
 */
export default async function DealsOfTheDay() {
  return <DealsGrid products={await homeDeals()} />
}

/**
 * The SYNCHRONOUS grid the page shows while the catalogue read is in flight.
 *
 * `app/(store)/page.tsx` uses this as the Suspense fallback around
 * `HomepageSections`. A fallback that itself awaits the database would
 * suspend the boundary it is the fallback for, which React resolves by
 * suspending the parent - the root - and the static shell would wait on the
 * read it exists to not wait on. So the fallback is the capture, unread and
 * unawaited, and the catalogue replaces it when it lands.
 */
export function DealsOfTheDayFallback() {
  return <DealsGrid products={FIXTURE_DEALS} />
}
