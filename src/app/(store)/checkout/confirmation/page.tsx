import { redirect } from 'next/navigation'
import { Suspense } from 'react'

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
