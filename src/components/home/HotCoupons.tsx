import CouponCard, { type Coupon } from '@/components/CouponCard'
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'

/** refs/electro.html .section-products-carousel — adapted for hot coupons (coupon_deals) */
export default async function HotCoupons() {
  const supabase = await createClient()
  const { data } = await supabase
    .from('coupon_deals')
    .select(
      'id, title_he, business_name, original_price, platform_price, discount_percentage, location_he, image_url',
    )
    .eq('status', 'active')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(8)

  const coupons = (data ?? []) as Coupon[]

  if (coupons.length === 0) return null

  return (
    <section dir="rtl" aria-label="קופונים חמים" className="mx-auto max-w-page px-4 py-6 font-sans">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-[#ededed] pb-3">
        <h2 className="text-[22px] font-bold text-[#333e48]">קופונים חמים 🔥</h2>
        <Link
          href="/coupons"
          className="text-sm font-semibold text-[#7e7e7e] transition-colors hover:text-[#333e48]"
        >
          לכל הקופונים
        </Link>
      </header>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {coupons.map((coupon) => (
          <CouponCard key={coupon.id} coupon={coupon} />
        ))}
      </div>
    </section>
  )
}
