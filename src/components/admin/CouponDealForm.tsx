'use client'

import ImageUploader from '@/components/admin/ImageUploader'
import { type CouponDealFormState, upsertCouponDeal } from '@/server/actions/admin/coupon-deals'
import type { CouponDeal, Vendor } from '@/types/database'
import { MapPin, Tag } from 'lucide-react'
import Image from 'next/image'
import { useActionState, useState } from 'react'

interface Props {
  deal?: CouponDeal
  vendors: Pick<Vendor, 'id' | 'business_name'>[]
}

const INITIAL: CouponDealFormState = null

export default function CouponDealForm({ deal, vendors }: Props) {
  const [state, action, pending] = useActionState(upsertCouponDeal, INITIAL)
  const [imageUrl, setImageUrl] = useState<string[]>(deal?.image_url ? [deal.image_url] : [])
  const [originalPrice, setOriginalPrice] = useState(deal?.original_price ?? 0)
  const [titleHe, setTitleHe] = useState(deal?.title_he ?? '')
  const [businessName, setBusinessName] = useState(deal?.business_name ?? '')
  const [locationHe, setLocationHe] = useState(deal?.location_he ?? '')

  // The absolute amount the customer pays on site, entered by the admin. It is
  // NOT 10% of the sticker: that model was abolished on 2026-07-24 and the
  // money engine bills products.coupon_price_ils. Deriving it here quoted the
  // admin one number while the checkout charged another.
  const [platformPrice, setPlatformPrice] = useState(deal?.platform_price ?? 0)
  const discountPct =
    originalPrice > 0 && platformPrice > 0
      ? Math.round((1 - platformPrice / originalPrice) * 100)
      : 0

  const error = state && 'error' in state ? state.error : null

  const todayStr = new Date().toISOString().slice(0, 10)

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Form */}
      <div className="lg:col-span-2">
        <form action={action} className="space-y-5 bg-white border border-gray-200 rounded-xl p-6">
          {deal && <input type="hidden" name="id" value={deal.id} />}
          <input type="hidden" name="image_url" value={imageUrl[0] ?? ''} />

          {error && (
            <div className="bg-red-50 text-red-700 text-sm rounded-lg px-4 py-2">{error}</div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="cd-title" className="block text-xs font-medium text-gray-700 mb-1">
                כותרת *
              </label>
              <input
                id="cd-title"
                name="title_he"
                value={titleHe}
                onChange={(e) => setTitleHe(e.target.value)}
                required
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
              />
            </div>
            <div>
              <label htmlFor="cd-biz" className="block text-xs font-medium text-gray-700 mb-1">
                שם עסק *
              </label>
              <input
                id="cd-biz"
                name="business_name"
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                required
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label htmlFor="cd-orig" className="block text-xs font-medium text-gray-700 mb-1">
                מחיר מקורי (₪) *
              </label>
              <input
                id="cd-orig"
                name="original_price"
                type="number"
                min="1"
                step="0.01"
                value={originalPrice || ''}
                onChange={(e) => setOriginalPrice(Number(e.target.value))}
                required
                dir="ltr"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
              />
            </div>
            <div>
              <label
                htmlFor="platform_price"
                className="block text-xs font-medium text-gray-700 mb-1"
              >
                מחיר באתר (סכום מוחלט)
              </label>
              <input
                id="platform_price"
                name="platform_price"
                type="number"
                min={0}
                step="0.01"
                max={originalPrice || undefined}
                value={platformPrice || ''}
                onChange={(e) => setPlatformPrice(Number(e.target.value))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
              />
              <p className="mt-1 text-xs text-gray-500">
                הסכום שהלקוח משלם באתר. היתרה נגבית בבית העסק.
              </p>
            </div>
            <div>
              <p className="block text-xs font-medium text-gray-700 mb-1">הנחה</p>
              <div className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 text-green-700 font-bold">
                {discountPct}%
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="cd-from" className="block text-xs font-medium text-gray-700 mb-1">
                תאריך התחלה *
              </label>
              <input
                id="cd-from"
                name="valid_from"
                type="date"
                defaultValue={deal?.valid_from?.slice(0, 10) ?? todayStr}
                required
                dir="ltr"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
              />
            </div>
            <div>
              <label htmlFor="cd-until" className="block text-xs font-medium text-gray-700 mb-1">
                תאריך סיום
              </label>
              <input
                id="cd-until"
                name="valid_until"
                type="date"
                defaultValue={deal?.valid_until?.slice(0, 10) ?? ''}
                dir="ltr"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="cd-max" className="block text-xs font-medium text-gray-700 mb-1">
                מקס׳ שימושים (סה״כ)
              </label>
              <input
                id="cd-max"
                name="max_uses"
                type="number"
                min="1"
                defaultValue={deal?.max_uses ?? ''}
                dir="ltr"
                placeholder="ללא הגבלה"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
              />
            </div>
            <div>
              <label htmlFor="cd-maxu" className="block text-xs font-medium text-gray-700 mb-1">
                מקס׳ לכל משתמש
              </label>
              <input
                id="cd-maxu"
                name="max_uses_per_user"
                type="number"
                min="1"
                defaultValue={deal?.max_uses_per_user ?? 1}
                dir="ltr"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
              />
            </div>
          </div>

          <div>
            <label htmlFor="cd-terms" className="block text-xs font-medium text-gray-700 mb-1">
              תנאים
            </label>
            <textarea
              id="cd-terms"
              name="terms_he"
              defaultValue={deal?.terms_he ?? ''}
              rows={3}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand resize-none"
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-3 md:col-span-1">
              <label htmlFor="cd-loc" className="block text-xs font-medium text-gray-700 mb-1">
                מיקום
              </label>
              <input
                id="cd-loc"
                name="location_he"
                value={locationHe}
                onChange={(e) => setLocationHe(e.target.value)}
                placeholder="תל אביב, דיזנגוף"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
              />
            </div>
            <div>
              <label htmlFor="cd-lat" className="block text-xs font-medium text-gray-700 mb-1">
                קו רוחב
              </label>
              <input
                id="cd-lat"
                name="lat"
                type="number"
                step="any"
                defaultValue={deal?.lat ?? ''}
                dir="ltr"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
              />
            </div>
            <div>
              <label htmlFor="cd-lng" className="block text-xs font-medium text-gray-700 mb-1">
                קו אורך
              </label>
              <input
                id="cd-lng"
                name="lng"
                type="number"
                step="any"
                defaultValue={deal?.lng ?? ''}
                dir="ltr"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="cd-vendor" className="block text-xs font-medium text-gray-700 mb-1">
                ספק
              </label>
              <select
                id="cd-vendor"
                name="vendor_id"
                defaultValue={deal?.vendor_id ?? ''}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
              >
                <option value="">ללא ספק</option>
                {vendors.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.business_name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="cd-status" className="block text-xs font-medium text-gray-700 mb-1">
                סטטוס
              </label>
              <select
                id="cd-status"
                name="status"
                defaultValue={deal?.status ?? 'draft'}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
              >
                <option value="draft">טיוטה</option>
                <option value="active">פעיל</option>
                <option value="paused">מושהה</option>
                <option value="archived">ארכיון</option>
              </select>
            </div>
          </div>

          <div>
            <p className="text-xs font-medium text-gray-700 mb-2">תמונה</p>
            <ImageUploader
              bucket="coupon-images"
              folder="deals"
              value={imageUrl}
              onChange={(urls) => setImageUrl(urls.slice(-1))}
              maxFiles={1}
            />
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button
              type="submit"
              disabled={pending}
              className="bg-brand hover:bg-brand-primary-hover disabled:opacity-60 text-brand-dark font-semibold rounded-lg px-6 py-2.5 text-sm transition-colors"
            >
              {pending ? 'שומר...' : deal ? 'עדכון עסקה' : 'יצירת עסקה'}
            </button>
            <a href="/admin/coupons" className="text-sm text-gray-500 hover:underline">
              ביטול
            </a>
          </div>
        </form>
      </div>

      {/* Live Preview */}
      <div className="lg:col-span-1">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
          תצוגה מקדימה
        </p>
        <CouponPreviewCard
          titleHe={titleHe}
          businessName={businessName}
          originalPrice={originalPrice}
          platformPrice={platformPrice}
          discountPct={discountPct}
          locationHe={locationHe}
          imageUrl={imageUrl[0]}
        />
      </div>
    </div>
  )
}

function CouponPreviewCard({
  titleHe,
  businessName,
  originalPrice,
  platformPrice,
  discountPct,
  locationHe,
  imageUrl,
}: {
  titleHe: string
  businessName: string
  originalPrice: number
  platformPrice: number
  discountPct: number
  locationHe: string
  imageUrl?: string
}) {
  return (
    <div
      dir="rtl"
      className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm max-w-xs"
    >
      <div className="relative h-40 bg-gray-100">
        {imageUrl ? (
          <Image src={imageUrl} alt="" fill className="object-cover" />
        ) : (
          <div className="flex items-center justify-center h-full text-gray-300">
            <Tag size={40} />
          </div>
        )}
        <div className="absolute top-2 right-2 bg-brand text-brand-dark text-xs font-bold px-2 py-1 rounded-lg">
          {discountPct}% הנחה
        </div>
      </div>
      <div className="p-4 space-y-1">
        <p className="text-xs text-gray-500">{businessName || 'שם עסק'}</p>
        <p className="font-semibold text-gray-900 text-sm leading-snug">
          {titleHe || 'כותרת העסקה'}
        </p>
        {locationHe && (
          <div className="flex items-center gap-1 text-xs text-gray-400">
            <MapPin size={11} />
            {locationHe}
          </div>
        )}
        <div className="pt-2 flex items-baseline gap-2">
          <span className="text-lg font-bold text-brand">
            ₪{platformPrice > 0 ? platformPrice.toFixed(2) : '—'}
          </span>
          {originalPrice > 0 && (
            <span className="text-xs text-gray-400 line-through">₪{originalPrice.toFixed(2)}</span>
          )}
        </div>
      </div>
    </div>
  )
}
