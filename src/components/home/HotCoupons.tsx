import HotCouponCard from '@/components/home/HotCouponCard'
import { getHotCoupons } from '@/lib/hot-coupons'
import { Suspense } from 'react'

async function HotCouponsGrid() {
  const coupons = await getHotCoupons()

  if (!coupons || coupons.length === 0) {
    return null
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {coupons.map((coupon) => (
        <HotCouponCard key={coupon.id} coupon={coupon} />
      ))}
    </div>
  )
}

/**
 * Hot Coupons section for the homepage.
 *
 * Displays featured coupon products that customers can prepay for online
 * and redeem at partner locations. Shows pricing, discount, copyable codes,
 * and expiration countdowns.
 */
export default function HotCoupons() {
  return (
    <section
      aria-label="קופונים חמים"
      className="mx-auto w-full max-w-6xl px-4 py-8 md:px-6 lg:py-12"
    >
      <div className="mb-8">
        <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-2">✨ קופונים חמים</h2>
        <p className="text-gray-600">קופונים בהנחה גדולה - שלם אונליין וקנה בחנות</p>
      </div>

      <Suspense fallback={<div className="text-center text-gray-500 py-8">טוען קופונים...</div>}>
        <HotCouponsGrid />
      </Suspense>
    </section>
  )
}
