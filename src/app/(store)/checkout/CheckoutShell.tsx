import { CHECKOUT_FLOW_STEPS, FLOW_STEP_TITLES } from '@/lib/checkout/steps'

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
 * SHAPED LIKE THE FLOW (UX17). Since 14.10.2026 the checkout opens on the
 * first of three steps, so the shell reserves what a guest sees first: the
 * step rail, the two rows of personal details with their continue control,
 * and the collapsed titles of the two steps still to come. The order panel
 * arrives with the body below the fold on a phone and beside it on desktop,
 * where its column does not move the footer.
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
          <div className="checkout-steps">
            <ol className="checkout-steps__list">
              {CHECKOUT_FLOW_STEPS.map((step, index) => (
                <li
                  key={step}
                  className="checkout-steps__item"
                  data-state={index === 0 ? 'current' : 'upcoming'}
                >
                  <span className="checkout-steps__label">
                    <span className="checkout-steps__num">{index + 1}</span>
                    <span className="checkout-steps__text">{FLOW_STEP_TITLES[step]}</span>
                  </span>
                </li>
              ))}
            </ol>
          </div>

          <section className="checkout-section" data-step-state="current">
            <div className="checkout-section__head">
              <h2 className="checkout-section__title">
                <span>{FLOW_STEP_TITLES.details}</span>
              </h2>
            </div>

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
            <div className="checkout-nav">
              <span className="checkout-nav__next" />
            </div>
          </section>

          {(['address', 'payment'] as const).map((step) => (
            <section key={step} className="checkout-section" data-step-state="upcoming">
              <div className="checkout-section__head">
                <h2 className="checkout-section__title">
                  <span>{FLOW_STEP_TITLES[step]}</span>
                </h2>
              </div>
            </section>
          ))}
        </div>
      </div>
    </>
  )
}
