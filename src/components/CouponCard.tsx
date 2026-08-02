import { MapPin, Tag } from 'lucide-react'
import Image from 'next/image'
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
          /**
           * Through the optimizer, not a raw <img>, and the reason is CSP
           * before it is bytes: `img-src` allows self, data, blob, Supabase and
           * Unsplash only, so a raw tag pointed at any other allowed host - R2,
           * picsum - renders a BROKEN IMAGE. `/_next/image` is same-origin, so
           * `'self'` covers whatever the upstream host is. Same fix as [18].
           *
           * `fill` is safe here only because the parent is `relative h-32`: it
           * has its own height, so an out-of-flow image cannot collapse it.
           *
           * `sizes` is measured on the rendered grid, not guessed from the
           * column: 360 -> 158, 412 -> 184, 480 -> 218, 640 -> 298, 767 ->
           * 361.5 (= 50vw - 22px), 768 -> 237.33, 900 -> 281.33 (= 33.33vw -
           * 18.67px), then the lg middle column, 1024 -> 162 and 1280 and up ->
           * 247.33, capped by max-w-7xl.
           */
          <Image
            src={coupon.image_url}
            alt={coupon.title_he}
            fill
            sizes="(max-width: 767px) calc(50vw - 22px), (max-width: 1023px) calc(33.33vw - 18.67px), (max-width: 1279px) calc(33.33vw - 179.33px), 248px"
            className="object-cover"
          />
        ) : (
          <div className="flex items-center justify-center h-full text-gray-300">
            <Tag size={36} />
          </div>
        )}
        {discountPct != null && discountPct > 0 && (
          <div // White on brand yellow is 1.41:1. This badge carries the discount
            // percentage, so an unreadable one loses the single number the card
            // exists to advertise.
            className="absolute top-2 end-2 bg-brand text-heading text-xs font-bold px-2 py-1 rounded-lg"
          >
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
