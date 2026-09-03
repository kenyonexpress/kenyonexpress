import { ogImage } from '@/app/api/og/url'
import CouponCard, { type Coupon } from '@/components/CouponCard'
import { CouponsGridSkeleton } from '@/components/CouponCardSkeleton'
import { orFail } from '@/lib/catalogue-read'
import { createClient } from '@/lib/supabase/server'
import { Suspense } from 'react'

/*
 * The listing shares as the brand card.
 *
 * There is no single row to draw here, and the root layout's
 * `twitter.card: 'summary_large_image'` turns "no image" into a blank grey
 * rectangle rather than into a small card. `t=default` is the generated
 * fallback the whole route is built around: it is what an unknown slug, a
 * deleted deal and a page with nothing of its own to show all render as.
 */
export const metadata = {
  title: 'קופונים',
  openGraph: {
    title: 'קופונים פעילים',
    type: 'website',
    locale: 'he_IL',
    images: [ogImage({ template: 'default' }, 'קניון אקספרס')],
  },
}

/**
 * The heading is the same for everyone, so it is the shell and the grid streams
 * under it. The catalogue read itself is uncached only because it goes through
 * the cookie-bound Supabase client; this is one of the pages a cookie-free
 * catalogue client plus `use cache` would make static outright.
 */
export default function CouponsPage() {
  return (
    <section className="space-y-4">
      <h1 className="text-lg font-bold text-gray-900">קופונים פעילים 🎟</h1>
      {/* NOT `fallback={null}`: with nothing here the footer painted 342px
          down and was thrown a thousand pixels lower when the grid arrived,
          which Lighthouse scored as CLS 0.585 on 2026-08-19. See the skeleton's
          own comment for the measurement. */}
      <Suspense fallback={<CouponsGridSkeleton />}>
        <CouponsGrid />
      </Suspense>
    </section>
  )
}

async function CouponsGrid() {
  const supabase = await createClient()

  // `orFail`, not `const { data }`. "אין קופונים פעילים כרגע" below is a claim
  // about the catalogue, and a discarded error made a failed read say it - to
  // every visitor, with nothing in any log, on the page the whole coupon
  // business is sold from.
  const coupons = orFail(
    await supabase
      .from('coupon_deals')
      .select(
        'id, title_he, business_name, original_price, platform_price, discount_percentage, location_he, image_url',
      )
      .eq('status', 'active')
      .is('deleted_at', null)
      .order('created_at', { ascending: false }),
    'coupons.list_read_failed',
  )

  return coupons?.length ? (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
      {(coupons as Coupon[]).map((c) => (
        <CouponCard key={c.id} coupon={c} />
      ))}
    </div>
  ) : (
    <div className="text-center py-12 text-gray-500 text-sm bg-white rounded-xl border border-gray-200">
      <p className="text-3xl mb-2">🎟</p>
      <p>אין קופונים פעילים כרגע</p>
    </div>
  )
}
