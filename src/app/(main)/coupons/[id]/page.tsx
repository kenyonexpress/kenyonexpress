import { getActiveCouponDealIds, getCouponDeal } from '@/lib/coupon-deals'
import { MapPin, Tag } from 'lucide-react'
import Image from 'next/image'
import { notFound } from 'next/navigation'

interface Props {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: Props) {
  const { id } = await params
  // The same cached read the body makes, so the title and the page cannot
  // describe different rows and the two do not cost two round trips.
  const deal = await getCouponDeal(id)
  return { title: deal ? `${deal.title_he} — ${deal.business_name}` : 'קופון' }
}

export async function generateStaticParams() {
  const ids = await getActiveCouponDealIds()
  return ids.map((id) => ({ id }))
}

/**
 * NO `<Suspense>`, BECAUSE AN UNKNOWN ID HAS TO BE ABLE TO 404.
 *
 * The lookup used to sit inside a boundary, under a shell that was the card's
 * outline. That shell went out with the status line, so `notFound()` ran too
 * late to change it and `/coupons/<any uuid at all>` answered **`200 OK`** with
 * a not-found body - a soft 404 over an unbounded id space. Same shape as the
 * one fixed on `/category/[slug]`, and the same reasoning applies.
 *
 * Removing the boundary is not enough on its own: `cacheComponents` fails the
 * BUILD on an uncached read outside one, which is what made this look
 * unfixable. The read moved to `lib/coupon-deals.ts` behind `use cache` on the
 * anon client, and that is what lets the page await the answer before it
 * commits a status. The shell it gave up was an empty grey box painted a moment
 * before the row arrived.
 */
export default async function CouponDealPage({ params }: Props) {
  const { id } = await params
  const deal = await getCouponDeal(id)

  if (!deal) notFound()

  /**
   * THE PERCENTAGES ARE GONE, AND THE INVENTED DEFAULT WITH THEM.
   *
   * `platform_price` is the ABSOLUTE amount charged online, set per deal by an
   * admin. This page printed "(10%)" and "(90%)" beside the two numbers and
   * fell back to a tenth of the sticker when the price was missing - the
   * pricing model abolished on 2026-07-24. `CouponCard`, which lists these same
   * rows, was corrected then; the detail page it links to was not, so the two
   * views of one table disagreed.
   *
   * Today's eight seed rows are all exactly a tenth of their sticker, so the
   * labels are arithmetically true and the bug is invisible. It stops being
   * invisible the first time an admin sets a price that is not a tenth - the
   * page would print "(10%)" next to a number that is not 10%, on a page that
   * quotes what a customer pays.
   *
   * A deal with no price is shown without one, exactly as the card does,
   * instead of being advertised at a number nobody set.
   */
  const platformPrice = deal.platform_price
  const remaining =
    platformPrice != null ? Math.round((deal.original_price - platformPrice) * 100) / 100 : null
  const discountPct =
    deal.discount_percentage ??
    (platformPrice != null && deal.original_price > 0
      ? Math.round((1 - platformPrice / deal.original_price) * 100)
      : null)

  return (
    <article className="space-y-4">
      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
        <div className="relative h-56 bg-gray-100">
          {deal.image_url ? (
            /* Optimizer, not a raw <img>: same CSP reason as CouponCard, and
               `fill` is safe because the parent is `relative h-56`. The box is
               the full width of the page column - the viewport minus the 32px
               page padding below lg, and the middle column of the three-column
               grid above it, capped at 766px by max-w-7xl. */
            <Image
              src={deal.image_url}
              alt={deal.title_he}
              fill
              sizes="(max-width: 1023px) calc(100vw - 32px), (max-width: 1279px) calc(100vw - 514px), 766px"
              className="object-cover"
            />
          ) : (
            <div className="flex items-center justify-center h-full text-gray-300">
              <Tag size={48} />
            </div>
          )}
          {/* start-3, logical: the same corner CouponCard pins its badge to,
              so the card a shopper clicked and the page it opens agree about
              where the discount sits. right-3 happened to be the same pixel
              in RTL but was the physical property this audit is removing. */}
          {discountPct != null && discountPct > 0 && (
            <div className="absolute top-3 start-3 bg-brand text-heading text-sm font-bold px-3 py-1.5 rounded-lg">
              {discountPct}% הנחה
            </div>
          )}
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

          {/* Pricing breakdown. The split is named in shekels, never in
              percentages: what the customer owes here is `platform_price`
              itself, and the balance is whatever is left of the sticker. */}
          <div className="bg-brand-light/40 border border-brand/20 rounded-xl p-4 space-y-2">
            {platformPrice != null && remaining != null ? (
              <>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-bold text-price">₪{platformPrice.toFixed(2)}</span>
                  <span className="text-sm text-gray-500 line-through">
                    ₪{Number(deal.original_price).toFixed(2)}
                  </span>
                </div>
                <div className="text-sm text-gray-700 space-y-1">
                  <p>
                    שלם <span className="font-semibold">₪{platformPrice.toFixed(2)}</span> עכשיו
                    באתר
                  </p>
                  <p>
                    ואת היתרה <span className="font-semibold">₪{remaining.toFixed(2)}</span> בבית
                    העסק בעת מימוש הקופון
                  </p>
                </div>
              </>
            ) : (
              <p className="text-sm text-gray-500">המחיר יעודכן בקרוב</p>
            )}
          </div>

          <button
            type="button"
            disabled
            className="w-full bg-brand/60 text-heading/75 font-semibold rounded-lg px-6 py-3 text-sm cursor-not-allowed"
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
            <p className="text-xs text-gray-500 pt-1">
              בתוקף עד {new Date(deal.valid_until).toLocaleDateString('he-IL')}
            </p>
          )}
        </div>
      </div>
    </article>
  )
}
