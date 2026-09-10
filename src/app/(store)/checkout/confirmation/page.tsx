import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'

/**
 * NOINDEX, and the canonical is the reason rather than the crawl budget. The root
 * layout declares `alternates.canonical: '/'` and Next inherits metadata, so a
 * page that sets neither tells Google it IS the home page - measured 2026-09-10
 * on sixteen public routes, this one among them. This route also redirects, and a
 * redirect that claims to be the home page is the worst version of it.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: true },
  // Self-canonical beside the noindex: inheriting the root layout's '/' would
  // aim the noindex at the home page, which is how Google resolves the pair.
  alternates: { canonical: '/checkout/confirmation' },
}

/**
 * Alias for the payment-return page. `/checkout/return` is the real
 * confirmation route (Cardcom lands there). This name is what operators and
 * the storefront inventory call it.
 *
 * `searchParams` is request data. Under cacheComponents it cannot be awaited
 * in the page shell, or prerender refuses the route. The body that reads it
 * sits in Suspense, same as `/checkout/return`.
 */
export default function CheckoutConfirmationAlias(props: {
  searchParams: Promise<{ order_id?: string }>
}) {
  return (
    <Suspense fallback={null}>
      <CheckoutConfirmationRedirect {...props} />
    </Suspense>
  )
}

async function CheckoutConfirmationRedirect({
  searchParams,
}: {
  searchParams: Promise<{ order_id?: string }>
}) {
  const { order_id } = await searchParams
  const query = order_id ? `?order_id=${encodeURIComponent(order_id)}` : ''
  return redirect(`/checkout/return${query}`)
}
