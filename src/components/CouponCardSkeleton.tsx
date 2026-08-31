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
  return (
    <div
      className="block bg-white rounded-xl border border-gray-100 overflow-hidden"
      aria-hidden="true"
    >
      <div className="relative h-32 bg-gray-100" />
      <div className="p-3 space-y-1">
        <p className="text-xs">
          <span className="block h-3 w-2/5 rounded bg-gray-100" />
        </p>
        <p className="text-sm leading-snug">
          <span className="block h-4 w-full rounded bg-gray-100" />
        </p>
        <div className="flex items-center gap-1 text-xs">
          <span className="block h-3 w-1/3 rounded bg-gray-100" />
        </div>
        <div className="pt-1 flex items-baseline gap-2">
          <span className="block h-5 w-16 rounded bg-gray-100" />
          <span className="block h-3 w-10 rounded bg-gray-100" />
        </div>
        <p className="text-micro">
          <span className="block h-3 w-3/4 rounded bg-gray-100" />
        </p>
      </div>
    </div>
  )
}

/** The grid of them, in the same columns and gap as the real one. */
export function CouponsGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div
      className="grid grid-cols-2 md:grid-cols-3 gap-3"
      aria-busy="true"
      aria-label="טוען קופונים"
    >
      {Array.from({ length: count }, (_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length placeholder, never reordered
        <CouponCardSkeleton key={i} />
      ))}
    </div>
  )
}
