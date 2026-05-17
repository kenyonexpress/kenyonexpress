'use client'

import { useState } from 'react'

export type Coupon = {
  id: string
  code: string
  discount_type: 'percent' | 'fixed'
  discount_value: number
  ends_at: string | null
  min_order_amount_ils: number | null
}

function formatDiscount(coupon: Coupon): string {
  if (coupon.discount_type === 'percent') return `${coupon.discount_value}% הנחה`
  return `₪${Number(coupon.discount_value).toFixed(0)} הנחה`
}

function formatExpiry(endsAt: string | null): string {
  if (!endsAt) return 'ללא תפוגה'
  return `בתוקף עד ${new Date(endsAt).toLocaleDateString('he-IL')}`
}

export default function CouponCard({ coupon }: { coupon: Coupon }) {
  const [copied, setCopied] = useState(false)

  function handleCopy() {
    navigator.clipboard.writeText(coupon.code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-4 flex items-center gap-4">
      <div className="flex-1 min-w-0">
        <p className="font-bold text-brand text-lg leading-tight">{formatDiscount(coupon)}</p>
        {coupon.min_order_amount_ils && (
          <p className="text-xs text-gray-400 mt-0.5">
            מינימום הזמנה ₪{Number(coupon.min_order_amount_ils).toFixed(0)}
          </p>
        )}
        <p className="text-xs text-gray-400 mt-0.5">{formatExpiry(coupon.ends_at)}</p>
      </div>

      <button
        type="button"
        onClick={handleCopy}
        className="shrink-0 border-2 border-dashed border-brand rounded-lg px-3 py-2 text-center min-w-[90px] hover:bg-brand-light transition-colors"
      >
        <p className="text-xs text-gray-400 mb-0.5">קוד קופון</p>
        <p className="font-mono font-bold text-sm text-brand">{copied ? '✓ הועתק' : coupon.code}</p>
      </button>
    </div>
  )
}
