import CouponCard from '@/components/CouponCard'
import { getHotCouponDeals } from '@/lib/homepage/below-fold'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'

/**
 * Eight coupon deals from `coupon_deals`, deepest discount first, under the
 * deals grid, with the same card `/coupons` renders so a deal looks the same
 * on both pages. Below the 2600px the parity gate scores (see
 * `lib/homepage/below-fold-rules.ts`).
 *
 * UX10: the cards are tickets (`CouponCard`) in the deals grid's own columns,
 * 1 / 2 / 4 at 0 / 768 / 1200 (`.hot-coupons__grid`, globals.css), with
 * `grid-auto-rows: 1fr` so a row of tickets is one height whatever each
 * carries. Before this it was two 159px columns on a phone and four 158px
 * columns at 768 (logs/ux10/before.json), too narrow for a stub, a code and a
 * countdown side by side.
 */
export default async function HotCoupons() {
  const coupons = await getHotCouponDeals()
  if (coupons.length === 0) return null

  return (
    <section
      aria-labelledby="hot-coupons-title"
      dir="rtl"
      className="mx-auto w-full max-w-deals px-deals-pad pb-10 font-sans md:px-deals-pad-md xl:px-0"
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 id="hot-coupons-title" className="m-0 text-section-title font-bold text-heading">
          קופונים חמים
        </h2>
        <Link
          href="/coupons"
          className="flex min-h-11 items-center gap-1 whitespace-nowrap text-sm text-heading transition-opacity hover:opacity-70"
        >
          לכל הקופונים
          <ArrowLeft size={16} aria-hidden="true" />
        </Link>
      </div>
      <div className="hot-coupons__grid" data-hot-coupons-grid>
        {coupons.map((coupon) => (
          <CouponCard key={coupon.id} coupon={coupon} />
        ))}
      </div>
    </section>
  )
}
