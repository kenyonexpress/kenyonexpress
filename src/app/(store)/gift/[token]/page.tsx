import GiftClaimForm from '@/components/gifts/GiftClaimForm'
import GiftPurchaseForm from '@/components/gifts/GiftPurchaseForm'
import { resolveStorefrontProductType } from '@/lib/commerce/product-type'
import { isWellFormedGiftToken } from '@/lib/gifts/claim-token'
import { t } from '@/lib/i18n/messages'
import { shekelsFromIlsRounded } from '@/lib/money-format'
import { loadProductBySlug } from '@/lib/product-detail'
import { createClient } from '@/lib/supabase/server'
import { type GiftPreview, loadGiftPreview } from '@/server/actions/gifts'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Suspense } from 'react'

/**
 * /gift/<segment>: the claim page for a gifted coupon, AND (S22) the page that
 * starts one, /gift/<product slug>.
 *
 * ONE SEGMENT, TWO MEANINGS, because Next allows one dynamic segment per level
 * and the claim links already in people's inboxes are /gift/<token>, so that
 * URL cannot move. They do not collide in practice: a token is 43 base64url
 * characters (`isWellFormedGiftToken`), and a product slug here is Hebrew or
 * short. The token is tried first only when it is token-shaped, and a miss
 * falls through to the product, so even an ASCII slug of token length still
 * resolves - at the cost of one indexed lookup.
 *
 * `noindex` on both, and not as a formality for the claim: the URL IS the
 * credential. A crawler that
 * reaches one of these holds a working claim link, and a claim link in an index
 * is a coupon anybody can take.
 */
export const metadata: Metadata = {
  // Neutral since S22: the same segment is also the page that STARTS a gift,
  // and "you received a gift" in the buyer's tab would be false there. A
  // per-segment title would need generateMetadata to resolve the token, which
  // is a second lookup of a credential for a tab label.
  title: 'מתנה',
  robots: { index: false, follow: false },
  // Self-canonical beside the noindex. Inheriting the root layout's '/' would
  // pair noindex with a canonical pointing at the home page, and Google resolves
  // that pair by following the canonical.
  alternates: { canonical: '/gift' },
}

type Props = { params: Promise<{ token: string }> }

/**
 * The shell prerenders; everything that reads the gift is inside `<Suspense>`.
 *
 * Required rather than stylistic: this app runs with `cacheComponents` ([21]),
 * where uncached data outside a Suspense boundary FAILS THE BUILD rather than
 * quietly making the route dynamic. The token lookup and the session read are
 * both per-request by definition.
 */
export default function GiftClaimPage(props: Props) {
  return (
    <main className="mx-auto w-full max-w-page px-4 py-12">
      <div className="mx-auto max-w-xl rounded-2xl border border-heading/15 bg-white p-6 text-center shadow-sm">
        <Suspense fallback={<p className="text-sm text-heading/75">רגע, טוענים את המתנה…</p>}>
          <GiftContent {...props} />
        </Suspense>
      </div>
    </main>
  )
}

async function GiftContent({ params }: Props) {
  // `await params` is itself uncached data, so it belongs inside the boundary
  // and not in the shell - same shape as /coupon/[id].
  const { token: segment } = await params

  if (isWellFormedGiftToken(segment)) {
    const gift = await loadGiftPreview(segment)
    if (gift) return <GiftClaim token={segment} gift={gift} />
  }

  let slug: string
  try {
    slug = decodeURIComponent(segment)
  } catch {
    notFound()
  }
  const detail = await loadProductBySlug(slug)
  if (!detail) notFound()
  return <GiftPurchase detail={detail} />
}

async function GiftPurchase({
  detail,
}: { detail: NonNullable<Awaited<ReturnType<typeof loadProductBySlug>>> }) {
  const { product, supplier } = detail
  const isCoupon = resolveStorefrontProductType(product) === 'coupon'
  const productHref = `/product/${encodeURIComponent(product.slug)}`

  return (
    <>
      <p className="text-sm font-medium text-heading/75">{t('gift.purchase.eyebrow')}</p>
      <h1 className="mt-2 text-2xl font-bold text-heading">{product.name_he}</h1>
      {supplier?.name && <p className="mt-1 text-sm text-heading/75">{supplier.name}</p>}
      <p className="mt-3 text-lg font-semibold text-heading">
        {t('gift.purchase.price')}: {shekelsFromIlsRounded(product.kenyon_price)}
      </p>

      {isCoupon ? (
        <>
          <p className="mt-4 text-sm leading-relaxed text-heading/80">{t('gift.purchase.intro')}</p>
          <GiftPurchaseForm productId={product.id} />
        </>
      ) : (
        <p className="mt-6 text-sm text-heading/80">{t('gift.purchase.notCoupon')}</p>
      )}

      <Link href={productHref} className="mt-6 inline-block text-sm underline underline-offset-2">
        {t('gift.purchase.backToProduct')}
      </Link>
    </>
  )
}

async function GiftClaim({ token, gift }: { token: string; gift: GiftPreview }) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const expires = gift.expiresAt
    ? new Date(gift.expiresAt).toLocaleDateString('he-IL', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : null

  return (
    <>
      <p className="text-sm font-medium text-heading/75">
        {gift.recipientName ? `${gift.recipientName}, קיבלת מתנה` : 'קיבלת מתנה'}
      </p>
      <h1 className="mt-2 text-2xl font-bold text-heading">{gift.productName ?? 'קופון'}</h1>
      {gift.supplierName && <p className="mt-1 text-sm text-heading/75">{gift.supplierName}</p>}

      {gift.message && (
        <blockquote className="mt-5 rounded-xl border border-heading/10 bg-heading/5 px-4 py-3 text-base leading-relaxed text-heading/90">
          {gift.message}
        </blockquote>
      )}

      {expires && <p className="mt-4 text-sm text-heading/75">הקופון בתוקף עד {expires}</p>}

      <div className="mt-6">
        {!gift.usable ? (
          <p className="text-sm text-heading/80">
            לא ניתן לקבל את הקופון הזה. אם לדעתכם מדובר בטעות,{' '}
            <Link href="/contact" className="underline underline-offset-2">
              פנו אלינו
            </Link>
            .
          </p>
        ) : gift.claimed ? (
          <p className="text-sm text-heading/80">
            המתנה כבר נאספה. אם אתם אספתם אותה, היא נמצאת{' '}
            <Link href="/account/coupons" className="underline underline-offset-2">
              בקופונים שלי
            </Link>
            .
          </p>
        ) : user ? (
          <GiftClaimForm token={token} />
        ) : (
          <>
            <p className="text-sm text-heading/80">
              כדי לקבל את הקופון לחשבון שלכם צריך להתחבר או להירשם. הקופון יישמר בחשבון שאיתו
              תתחברו.
            </p>
            <Link
              href={`/login?next=${encodeURIComponent(`/gift/${token}`)}`}
              className="mt-4 inline-block rounded-lg bg-brand px-6 py-3 font-semibold text-brand-dark transition-colors hover:bg-brand-primary-hover"
            >
              התחברות וקבלת הקופון
            </Link>
          </>
        )}
      </div>
    </>
  )
}
