import { CHECKOUT_STEPS, STEP_TITLES } from '@/lib/checkout/steps'

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
 * the reservation follows `checkout-page.css` at any viewport -- including the
 * 560px breakpoint where the step labels are hidden and the row gets shorter.
 * Numbers written into a skeleton are correct at exactly one width.
 *
 * THE GUEST NOTICE IS RESERVED, AND THAT IS A CHOICE ABOUT WHO IS HERE. It
 * renders only for a visitor with no session, and the shell cannot know which
 * it has without awaiting the auth round trip the boundary exists to skip. A
 * guest is the documented default for this route -- the cart is open, the
 * sign-in happens on the pay button, and `CheckoutPageBody` says so in as many
 * words. Reserving it makes the guest exact and leaves a signed-in shopper the
 * 88px this strip occupies. The reverse would have left the common path with
 * that shift instead.
 */
export function CheckoutShell() {
  return (
    <>
      <div className="checkout-guest-notice" aria-hidden="true" />

      <ol className="checkout-steps" aria-hidden="true">
        {CHECKOUT_STEPS.map((entry, index) => (
          <li key={entry} className="checkout-steps__item" data-state="upcoming">
            {/* A span, not a button: the real row is four controls and this one
                is scenery. Nothing here is focusable, so there is no control
                that announces itself before it can do anything. */}
            <span className="checkout-steps__btn">
              <span className="checkout-steps__index">{index + 1}</span>
              <span className="checkout-steps__label">{STEP_TITLES[entry]}</span>
            </span>
          </li>
        ))}
      </ol>

      <div className="checkout-page__grid" aria-hidden="true">
        <div className="checkout-col-main">
          <section className="checkout-section">
            <h2 className="checkout-section__title">
              <span>{STEP_TITLES[CHECKOUT_STEPS[0]]}</span>
            </h2>

            {/* Three rows of two, which is the personal-details step the page
                always opens on. Divs rather than disabled inputs: a disabled
                control is still a control in the document, and this is a grey
                box that happens to be 45px tall. */}
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

            <div className="checkout-skeleton__nav" />
          </section>
        </div>
      </div>
    </>
  )
}
