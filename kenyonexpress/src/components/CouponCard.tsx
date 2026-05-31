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

function platformPriceOf(coupon: Coupon): number {
  return coupon.platform_price ?? Math.round(coupon.original_price * 0.1 * 100) / 100
}

export default function CouponCard({ coupon }: { coupon: Coupon }) {
  const platformPrice = platformPriceOf(coupon)
  const discountPct = coupon.discount_percentage ?? 90

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
        <div className="absolute top-2 right-2 bg-brand text-white text-xs font-bold px-2 py-1 rounded-lg">
          {discountPct}% הנחה
        </div>
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
          <span className="text-lg font-bold text-brand">₪{platformPrice.toFixed(2)}</span>
          <span className="text-xs text-gray-400 line-through">
            ₪{Number(coupon.original_price).toFixed(2)}
          </span>
        </div>
        <p className="text-[11px] text-gray-400">שלם 10% עכשיו, 90% בבית העסק</p>
      </div>
    </Link>
  )
}
