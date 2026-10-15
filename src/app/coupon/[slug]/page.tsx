import { listCouponSlugsForPrerender, loadProductBySlug } from '@/lib/product-detail'
import { getProductSeoBySlug } from '@/lib/product-seo'
import { isVoucherId } from '@/lib/vouchers/coupon-path'
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { connection } from 'next/server'
import { Suspense } from 'react'
import CouponOfferPage, { couponOfferMetadata } from './CouponOfferPage'
import VoucherPage from './VoucherPage'

/**
 * `/coupon/<uuid>` is a customer's voucher, `/coupon/<slug>` is the public
 * coupon page of a product. One route, split by the shape of the segment,
 * and the proxy makes the same split for the session guard: see
 * `lib/vouchers/coupon-path.ts` for why the two share a prefix and why a
 * slug can never be mistaken for an id.
 */

type Props = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug: raw } = await params
  const segment = decodeURIComponent(raw)

  // The voucher half sets nothing that needs the row: it is noindex whoever
  // asks, and reading the voucher in metadata would read cookies before the
  // body's own guard does.
  if (isVoucherId(segment)) {
    return { title: 'הקופון שלי', robots: { index: false, follow: false } }
  }

  return couponOfferMetadata(segment, await getProductSeoBySlug(segment))
}

/**
 * Prerendered at build time, capped, like the product page. Its presence is
 * also what lets this route read `params` before a boundary: without it the
 * build refuses the route as uncached runtime data. A voucher id is never in
 * this list and renders on demand behind the boundary below.
 */
export async function generateStaticParams() {
  const slugs = await listCouponSlugsForPrerender()
  return slugs.map((slug) => ({ slug }))
}

export default async function CouponRoute(props: Props) {
  const { slug: raw } = await props.params
  const segment = decodeURIComponent(raw)

  if (isVoucherId(segment)) {
    // The voucher body reads the session, so it stays behind a boundary: the
    // shell streams first and the card is a request-time hole, exactly as the
    // page was before the route was shared.
    return (
      <Suspense
        fallback={<main dir="rtl" className="mx-auto min-h-screen max-w-md bg-gray-50 px-4 py-6" />}
      >
        <VoucherPage id={segment} />
      </Suspense>
    )
  }

  // The offer half is catalogue data behind `use cache`, so it is awaited
  // before the status line the way the product page does it: an unknown slug
  // answers a real 404, not a 200 with a not-found body.
  const detail = await loadProductBySlug(segment)
  if (detail && !detail.couponOffer) {
    return (
      <Suspense fallback={null}>
        <RedirectToProduct slug={segment} />
      </Suspense>
    )
  }
  return <CouponOfferPage slug={segment} detail={detail} />
}

/**
 * A product with no coupon offer sends the visitor to its product page. The
 * redirect used to be thrown from CouponOfferPage itself, in the static
 * half of the render, and the response carried the Location header TWICE
 * (the shell pass and the resume pass each wrote it): curl followed the
 * first, a browser joined the two with a comma and landed on a 404
 * (`/product/x, /product/x`; coupon-offer.spec, WRETRY-XF04, 15.10.2026).
 * Behind a boundary and after `connection()` only the request-time pass
 * runs it, the way the voucher half's sign-in redirect already does.
 */
async function RedirectToProduct({ slug }: { slug: string }): Promise<never> {
  await connection()
  return redirect(`/product/${encodeURIComponent(slug)}`)
}
