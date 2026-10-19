import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'

/**
 * It only ever redirects, and it still needs the meta: a redirect is followed
 * by a crawler, and the alias URL itself is what would be listed. Same reason
 * as `/checkout/return`, which this forwards to.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
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
