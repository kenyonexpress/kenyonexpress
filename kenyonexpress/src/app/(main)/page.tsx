import CategoryStrip from '@/components/CategoryStrip'
import CouponCard, { type Coupon } from '@/components/CouponCard'
import ProductCard, { type Product } from '@/components/ProductCard'
import HeroSection from '@/components/home/HeroSection'
import HomeThreeColumnSection from '@/components/home/HomeThreeColumnSection'
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'

export default async function HomePage() {
  const supabase = await createClient()

  const [{ data: products }, { data: coupons }] = await Promise.all([
    supabase
      .from('products')
      .select('id, slug, name_he, kenyon_price, images, stock_quantity')
      .eq('status', 'active')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(4),
    supabase
      .from('coupon_deals')
      .select(
        'id, title_he, business_name, original_price, platform_price, discount_percentage, location_he, image_url',
      )
      .eq('status', 'active')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(3),
  ])

  return (
    <>
      <HomeThreeColumnSection />
      <HeroSection />
      <CategoryStrip />

      {/* Featured products */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <Link href="/products" className="text-sm text-brand font-medium hover:underline">
            כל המוצרים
          </Link>
          <h3 className="text-base font-bold">מוצרים חמים 🔥</h3>
        </div>
        {products?.length ? (
          <div className="grid grid-cols-2 gap-3">
            {(products as Product[]).map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-gray-400 text-sm bg-white rounded-xl border border-gray-200">
            <p className="text-3xl mb-2">📦</p>
            <p>אין מוצרים להצגה כרגע</p>
          </div>
        )}
      </section>

      {/* Active coupons */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <Link href="/coupons" className="text-sm text-brand font-medium hover:underline">
            כל הקופונים
          </Link>
          <h3 className="text-base font-bold">קופונים פעילים 🎟</h3>
        </div>
        {coupons?.length ? (
          <div className="space-y-3">
            {(coupons as Coupon[]).map((c) => (
              <CouponCard key={c.id} coupon={c} />
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-gray-400 text-sm bg-white rounded-xl border border-gray-200">
            <p className="text-3xl mb-2">🎟</p>
            <p>אין קופונים פעילים כרגע</p>
          </div>
        )}
      </section>
    </>
  )
}
