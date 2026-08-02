import { MapPin, Tag } from 'lucide-react'
import Link from 'next/link'

export type Coupon = {
  id: string
  title_he: string
  business_name: string
  original_price: number
  platform_price: number | null
  discount_percentage: number | null
  location_he: string | null
  image_url: string | null
}

export default function CouponCard({ coupon }: { coupon: Coupon }) {
  // platform_price is the absolute amount charged online, set per product by
  // the admin. There is no default: the card used to fall back to 10% of the
  // sticker and the strip below it read "שלם 10% עכשיו, 90% בבית העסק", which
  // is the pricing model abolished on 2026-07-24. A coupon without a price is
  // shown without one rather than advertised at an invented number.
  const platformPrice = coupon.platform_price
  const original = Number(coupon.original_price)
  const discountPct =
    coupon.discount_percentage ??
    (platformPrice != null && original > 0
      ? Math.round((1 - platformPrice / original) * 100)
      : null)

  return (
    <Link
      href={`/coupons/${coupon.id}`}
      className="block bg-white rounded-xl border border-gray-100 overflow-hidden hover:shadow-md transition-shadow"
    >
      <div className="relative h-32 bg-gray-100">
        {coupon.image_url ? (
          <img
            src={coupon.image_url}
            alt={coupon.title_he}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="flex items-center justify-center h-full text-gray-300">
            <Tag size={36} />
          </div>
        )}
        {discountPct != null && discountPct > 0 && (
          <div className="absolute top-2 end-2 bg-brand text-white text-xs font-bold px-2 py-1 rounded-lg">
            {discountPct}% הנחה
          </div>
        )}
      </div>
      <div className="p-3 space-y-1">
        <p className="text-xs text-gray-500">{coupon.business_name}</p>
        <p className="text-sm font-semibold text-gray-900 line-clamp-2 leading-snug">
          {coupon.title_he}
        </p>
        {coupon.location_he && (
          <div className="flex items-center gap-1 text-xs text-gray-400">
            <MapPin size={11} />
            {coupon.location_he}
          </div>
        )}
        <div className="pt-1 flex items-baseline gap-2">
          {platformPrice != null ? (
            <>
              <span className="text-lg font-bold text-brand">₪{platformPrice.toFixed(2)}</span>
              <span className="text-xs text-gray-400 line-through">₪{original.toFixed(2)}</span>
            </>
          ) : (
            <span className="text-sm text-gray-400">המחיר יעודכן בקרוב</span>
          )}
        </div>
        {platformPrice != null && (
          <p className="text-micro text-gray-400">
            ₪{platformPrice.toFixed(2)} באתר, היתרה בבית העסק
          </p>
        )}
      </div>
    </Link>
  )
}
