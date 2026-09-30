import { STEP_TITLES } from '@/lib/checkout/steps'

/**
 * The Suspense fallback for /checkout, at the height of what replaces it.
 *
 * WHAT IT COST TO PAINT A HEADING AND NOTHING ELSE. This page streams the
 * cart, the address and the saved cards under a boundary so the response can
 * start before any of them are read, and the fallback used to be the heading
 * alone. The footer therefore painted just below the `h1`, and the form pushed
 * it about seven hundred pixels down when it arrived: MEASURED at CLS 0.2190
 * on a seeded cart, twice the 0.1 "good" boundary, on the page where money
 * changes hands. It is the same defect stage 8 fixed on `/coupons` (0.585) and
 * it survived here because the CLS sweep visits `/checkout` with an EMPTY cart,
 * which bounces to `/cart` and measures the cart under this route's name. The
 * gate that found it seeds first.
 *
 * Every box below carries the real class, not a copy of its measurements, so
 * the reservation follows `checkout-page.css` at any viewport. Numbers written
 * into a skeleton are correct at exactly one width.
 *
 * SHAPED LIKE THE SINGLE PAGE. Since 30.09.2026 the checkout has no stepper
 * and shows every section at once, so the shell reserves the two sections a
 * guest always sees first: two rows of personal details and four rows of
 * address. The rest of the page (notes, the order panel) arrives with the
 * body below the fold on a phone and beside it on desktop, where its column
 * does not move the footer.
 *
 * THE GUEST NOTICE IS RESERVED, AND THAT IS A CHOICE ABOUT WHO IS HERE. It
 * renders only for a visitor with no session, and the shell cannot know which
 * it has without awaiting the auth round trip the boundary exists to skip. A
 * guest is the documented default for this route, so reserving it makes the
 * guest exact and leaves a signed-in shopper the 88px this strip occupies. The
 * reverse would have left the common path with that shift instead.
 */
export function CheckoutShell() {
  return (
    <>
      <div className="checkout-guest-notice" aria-hidden="true" />

      <div className="checkout-page__grid" aria-hidden="true">
        <div className="checkout-col-main">
          <section className="checkout-section">
            <h2 className="checkout-section__title">
              <span>{STEP_TITLES.details}</span>
            </h2>

            {/* Divs rather than disabled inputs: a disabled control is still a
                control in the document, and this is a grey box that happens
                to be 45px tall. */}
            {[0, 1].map((row) => (
              <div key={row} className="checkout-fields-row">
                {[0, 1].map((cell) => (
                  <div key={cell} className="checkout-field">
                    <span className="checkout-skeleton__label" />
                    <span className="checkout-skeleton__input" />
                  </div>
                ))}
              </div>
            ))}
          </section>

          <section className="checkout-section">
            <h2 className="checkout-section__title">
              <span>{STEP_TITLES.address}</span>
            </h2>

            <div className="checkout-fields-row checkout-fields-row--single">
              <div className="checkout-field">
                <span className="checkout-skeleton__label" />
                <span className="checkout-skeleton__input" />
              </div>
            </div>
            {[0, 1, 2].map((row) => (
              <div key={row} className="checkout-fields-row">
                {[0, 1].map((cell) => (
                  <div key={cell} className="checkout-field">
                    <span className="checkout-skeleton__label" />
                    <span className="checkout-skeleton__input" />
                  </div>
                ))}
              </div>
            ))}
          </section>
        </div>
      </div>
    </>
  )
}
