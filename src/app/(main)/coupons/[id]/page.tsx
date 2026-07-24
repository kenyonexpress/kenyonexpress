import { createClient } from '@/lib/supabase/server'
import { MapPin, Tag } from 'lucide-react'
import { notFound } from 'next/navigation'

interface Props {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: Props) {
  const { id } = await params
  const supabase = await createClient()
  const { data } = await supabase
    .from('coupon_deals')
    .select('title_he, business_name')
    .eq('id', id)
    .single()
  return { title: data ? `${data.title_he} — ${data.business_name}` : 'קופון' }
}

export default async function CouponDealPage({ params }: Props) {
  const { id } = await params
  const supabase = await createClient()

  const { data: deal } = await supabase
    .from('coupon_deals')
    .select('*')
    .eq('id', id)
    .eq('status', 'active')
    .is('deleted_at', null)
    .single()

  if (!deal) notFound()

  const platformPrice = deal.platform_price ?? Math.round(deal.original_price * 0.1 * 100) / 100
  const remaining = Math.round((deal.original_price - platformPrice) * 100) / 100
  const discountPct = deal.discount_percentage ?? 90

  return (
    <article className="space-y-4">
      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
        <div className="relative h-56 bg-gray-100">
          {deal.image_url ? (
            <img src={deal.image_url} alt={deal.title_he} className="w-full h-full object-cover" />
          ) : (
            <div className="flex items-center justify-center h-full text-gray-300">
              <Tag size={48} />
            </div>
          )}
          <div className="absolute top-3 end-3 bg-brand text-white text-sm font-bold px-3 py-1.5 rounded-lg">
            {discountPct}% הנחה
          </div>
        </div>

        <div className="p-5 space-y-3">
          <p className="text-sm text-gray-500">{deal.business_name}</p>
          <h1 className="text-xl font-bold text-gray-900 leading-snug">{deal.title_he}</h1>

          {deal.location_he && (
            <div className="flex items-center gap-1.5 text-sm text-gray-500">
              <MapPin size={14} />
              {deal.location_he}
            </div>
          )}

          {/* Pricing breakdown */}
          <div className="bg-brand-light/40 border border-brand/20 rounded-xl p-4 space-y-2">
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-brand">₪{platformPrice.toFixed(2)}</span>
              <span className="text-sm text-gray-400 line-through">
                ₪{Number(deal.original_price).toFixed(2)}
              </span>
            </div>
            <div className="text-sm text-gray-700 space-y-1">
              <p>
                שלם <span className="font-semibold">₪{platformPrice.toFixed(2)}</span> (10%) עכשיו
                באתר
              </p>
              <p>
                ואת היתרה <span className="font-semibold">₪{remaining.toFixed(2)}</span> (90%) בבית
                העסק בעת מימוש הקופון
              </p>
            </div>
          </div>

          <button
            type="button"
            disabled
            className="w-full bg-brand/60 text-white font-semibold rounded-lg px-6 py-3 text-sm cursor-not-allowed"
          >
            רכישת קופון — בקרוב
          </button>

          {deal.terms_he && (
            <div className="pt-2">
              <p className="text-xs font-semibold text-gray-500 mb-1">תנאי מימוש</p>
              <p className="text-sm text-gray-600 whitespace-pre-line">{deal.terms_he}</p>
            </div>
          )}

          {deal.valid_until && (
            <p className="text-xs text-gray-400 pt-1">
              בתוקף עד {new Date(deal.valid_until).toLocaleDateString('he-IL')}
            </p>
          )}
        </div>
      </div>
    </article>
  )
}
