/**
 * Streaming fallback for the coupon archive grid.
 *
 * MEASURED, 2026-08-19 (MISSION-FINAL stage 8). `/coupons` rendered its heading
 * and then `<Suspense fallback={null}>`, so the footer painted 342px down the
 * page and was thrown ~1000px lower the moment the grid streamed in. Lighthouse
 * scored the page CLS 0.585 -- against 0.000 on every other public route except
 * checkout -- and named the footer as the shifting element. Reproduced three
 * times with scripts/_cls-stage8.mjs, 0.584 each time.
 *
 * The placeholder mirrors the real card's box rather than inventing one: same
 * wrapper, same `h-32` image band, same `p-3 space-y-1` stack of lines at the
 * same font sizes, so a row of placeholders is the height of a row of cards.
 *
 * A shift that happens entirely below the fold does not count, which is what
 * makes this work even when the real list is longer or shorter than the
 * placeholder: eight cards is four rows on a phone, the footer starts off
 * screen, and it stays off screen while the grid resolves.
 */
export default function CouponCardSkeleton() {
  // UX10: the ticket's box, not the old image card's: the stub, then the body
  // stack at the ticket's own sizes (business 12, two title lines at 14/1.375,
  // location 12, price row, split line, a 44px footer control). The eight seed
  // rows carry no photograph, so the placeholder reserves no image band.
  return (
    <div className="coupon-ticket" aria-hidden="true">
      <div className="coupon-ticket__row">
        <div className="coupon-ticket__stub" />
        <div className="coupon-ticket__body">
          <p className="coupon-ticket__business">
            <span className="block h-3 w-2/5 rounded bg-gray-100" />
          </p>
          <p className="coupon-ticket__title">
            <span className="block h-4 w-full rounded bg-gray-100" />
          </p>
          <p className="coupon-ticket__location">
            <span className="block h-3 w-1/3 rounded bg-gray-100" />
          </p>
          <div className="coupon-ticket__price">
            <span className="block h-5 w-16 rounded bg-gray-100" />
            <span className="block h-3 w-10 rounded bg-gray-100" />
          </div>
          <p className="coupon-ticket__split">
            <span className="block h-3 w-3/4 rounded bg-gray-100" />
          </p>
          <div className="coupon-ticket__footer">
            <span className="block h-11 w-28 rounded bg-gray-100" />
          </div>
        </div>
      </div>
    </div>
  )
}

export const COUPONS_LOADING_LABEL = 'טוען קופונים…'

/**
 * The grid of them, in the same columns and gap as the real one.
 *
 * `aria-busy` on the grid and one visually hidden sentence, the same surface
 * as AccountContentSkeleton, and NOT `aria-label` on the div: a div has no
 * role, and ARIA prohibits naming a role-less element, so axe reported
 * `aria-prohibited-attr` on this grid whenever the a11y scan of /coupons
 * caught the fallback before the real grid streamed in (measured once in
 * 1,122 cases, the XF04 pair, 15.10.2026: the node had already left the DOM
 * by the time axe serialised it, so the target read `:root`). Every ticket
 * below is `aria-hidden`, so the label was the only text and it was never
 * announced anyway; the sentence is.
 */
export function CouponsGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true">
      <p className="sr-only">{COUPONS_LOADING_LABEL}</p>
      {Array.from({ length: count }, (_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length placeholder, never reordered
        <CouponCardSkeleton key={i} />
      ))}
    </div>
  )
}
