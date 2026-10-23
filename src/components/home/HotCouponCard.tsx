'use client'

import { buildCouponOffer, shekelsFromIls } from '@/lib/commerce/coupon-offer'
import type { HotCoupon } from '@/lib/hot-coupons'
import { useEffect, useState } from 'react'

interface HotCouponCardProps {
  coupon: HotCoupon
}

/**
 * Display a single hot coupon with price, copy, code button, and countdown.
 *
 * The card shows:
 * - Coupon name/description
 * - Online price and balance due at business
 * - Discount percentage badge
 * - Copy-able coupon code
 * - Expiration countdown
 */
export default function HotCouponCard({ coupon }: HotCouponCardProps) {
  const [timeLeft, setTimeLeft] = useState<string>('')
  const [isCopied, setIsCopied] = useState(false)

  // Generate a deterministic coupon code from product ID
  const couponCode = coupon.id.substring(0, 8).toUpperCase()

  const offer = buildCouponOffer({
    fullPriceIls: coupon.price_ils,
    couponPriceIls: coupon.coupon_price_ils,
    validUntil: coupon.offer_valid_until,
    expiryDays: coupon.coupon_expiry_days,
  })

  useEffect(() => {
    const updateCountdown = () => {
      if (!offer.validUntil) return

      const now = new Date()
      const diff = offer.validUntil.getTime() - now.getTime()

      if (diff <= 0) {
        setTimeLeft('תוקף פג')
      } else {
        const days = Math.floor(diff / (1000 * 60 * 60 * 24))
        const hours = Math.floor((diff / (1000 * 60 * 60)) % 24)

        if (days > 0) {
          setTimeLeft(`${days} ימים`)
        } else if (hours > 0) {
          setTimeLeft(`${hours} שעות`)
        } else {
          setTimeLeft('עוד מעט')
        }
      }
    }

    updateCountdown()
    const timer = setInterval(updateCountdown, 60000) // Update every minute

    return () => clearInterval(timer)
  }, [offer.validUntil])

  const copyCode = () => {
    navigator.clipboard.writeText(couponCode)
    setIsCopied(true)
    setTimeout(() => setIsCopied(false), 2000)
  }

  if (!offer.sellable) {
    return null
  }

  return (
    <article className="hot-coupon-card rounded-lg border border-border bg-white p-4 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          {/* Product name */}
          <h3 className="font-semibold text-foreground text-sm line-clamp-2">{coupon.name_he}</h3>

          {/* Supplier name if available */}
          {coupon.supplier?.name && (
            <p className="text-xs text-muted-foreground mt-1">{coupon.supplier.name}</p>
          )}

          {/* Pricing info */}
          <div className="mt-2 space-y-1">
            <div className="flex items-baseline gap-2">
              <span className="text-lg font-bold text-brand-red">
                {shekelsFromIls(offer.paidOnlineIls)}
              </span>
              <span className="text-xs text-muted-foreground line-through">
                {shekelsFromIls(offer.fullPriceIls)}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              + {shekelsFromIls(offer.balanceAtBusinessIls)} בחנות
            </p>
          </div>

          {/* Discount badge */}
          {offer.discountPercent > 0 && (
            <div className="mt-2 inline-block rounded-full bg-brand-yellow px-2.5 py-1">
              <span className="text-xs font-semibold text-foreground">
                {offer.discountPercent}% הנחה
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Code section */}
      <div className="mt-4 rounded-lg bg-muted p-3">
        <p className="text-xs text-muted-foreground mb-2">קוד קופון:</p>
        <button
          type="button"
          onClick={copyCode}
          className="w-full py-2 px-3 bg-white border border-border rounded-md font-mono font-bold text-center hover:bg-muted transition-colors text-sm"
          title="לחץ להעתקה"
        >
          {couponCode}
        </button>
        {isCopied && <p className="text-xs text-green-600 mt-1 text-center">✓ הועתק!</p>}
      </div>

      {/* Expiration countdown */}
      {timeLeft && (
        <div className="mt-3 text-center">
          <p className="text-xs font-semibold text-orange-600">
            {timeLeft === 'תוקף פג' ? 'תוקף פג' : `תוקף: ${timeLeft}`}
          </p>
        </div>
      )}
    </article>
  )
}
