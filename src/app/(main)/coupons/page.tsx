import CouponCard, { type Coupon } from '@/components/CouponCard'
import { createClient } from '@/lib/supabase/server'

export const metadata = { title: 'קופונים' }

export default async function CouponsPage() {
  const supabase = await createClient()

  const { data: coupons } = await supabase
    .from('coupon_deals')
    .select(
      'id, title_he, business_name, original_price, platform_price, discount_percentage, location_he, image_url',
    )
    .eq('status', 'active')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  return (
    <section className="space-y-4">
      <h1 className="text-lg font-bold text-gray-900">קופונים פעילים 🎟</h1>
      {coupons?.length ? (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {(coupons as Coupon[]).map((c) => (
            <CouponCard key={c.id} coupon={c} />
          ))}
        </div>
      ) : (
        <div className="text-center py-12 text-gray-400 text-sm bg-white rounded-xl border border-gray-200">
          <p className="text-3xl mb-2">🎟</p>
          <p>אין קופונים פעילים כרגע</p>
        </div>
      )}
    </section>
  )
}
