import { shekelsFromIlsRounded } from '@/lib/money-format'
import { type SimilarCoupon, loadSimilarCoupons } from '@/lib/similar-coupons'
import Image from 'next/image'
import Link from 'next/link'

/**
 * Up to four other coupons, linking to THEIR coupon pages.
 *
 * The cards link to `/coupon/[slug]` and not `/product/[slug]`, so a shopper
 * who arrived on the coupon variant stays on it. That is also what makes the
 * variant reachable at all: the archive and the home page link to product
 * pages, and a page nothing links to is a finished feature with no consumer.
 */
export function SimilarCouponCard({ coupon }: { coupon: SimilarCoupon }) {
  const href = `/coupon/${encodeURIComponent(coupon.slug)}`
  const discount =
    coupon.paidOnlineIls !== null && coupon.fullPriceIls > 0
      ? Math.round((1 - coupon.paidOnlineIls / coupon.fullPriceIls) * 100)
      : null

  return (
    <li className="cpn-similar__card">
      <Link href={href} className="cpn-similar__media" aria-label={coupon.name_he}>
        {coupon.image ? (
          <Image
            src={coupon.image}
            alt=""
            width={300}
            height={200}
            sizes="(max-width: 640px) 46vw, 25vw"
            quality={50}
            className="cpn-similar__image"
          />
        ) : (
          <span className="cpn-similar__placeholder" aria-hidden="true" />
        )}
        {discount !== null && discount > 0 && (
          <span className="cpn-similar__badge">-{discount}%</span>
        )}
      </Link>
      <div className="cpn-similar__body">
        {coupon.category && <p className="cpn-similar__category">{coupon.category.name_he}</p>}
        <h3 className="cpn-similar__name">
          <Link href={href}>{coupon.name_he}</Link>
        </h3>
        <p className="cpn-similar__price">
          {coupon.paidOnlineIls !== null ? (
            <>
              <span className="cpn-similar__pay">
                {shekelsFromIlsRounded(coupon.paidOnlineIls)}
              </span>
              <span className="cpn-similar__pay-label"> באתר</span>
              {coupon.fullPriceIls > coupon.paidOnlineIls && (
                <del className="cpn-similar__full">
                  {shekelsFromIlsRounded(coupon.fullPriceIls)}
                </del>
              )}
            </>
          ) : (
            <span className="cpn-similar__pay-label">פרטים בעמוד הקופון</span>
          )}
        </p>
      </div>
    </li>
  )
}

export default async function SimilarCoupons({
  categoryId,
  excludeId,
}: {
  categoryId: string | null
  excludeId: string
}) {
  const coupons = await loadSimilarCoupons(categoryId, excludeId)
  if (coupons.length === 0) return null

  return (
    <section className="cpn-similar" aria-labelledby="cpn-similar-title" data-cpn="similar">
      <h2 id="cpn-similar-title" className="cpn-similar__title">
        קופונים דומים
      </h2>
      <ul className="cpn-similar__grid">
        {coupons.map((coupon) => (
          <SimilarCouponCard key={coupon.id} coupon={coupon} />
        ))}
      </ul>
    </section>
  )
}
