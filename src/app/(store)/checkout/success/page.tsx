import { notFound, redirect } from 'next/navigation'
import { Suspense } from 'react'

/**
 * `/checkout/success` is an ALIAS, not a second confirmation page.
 *
 * The page a shopper actually lands on after paying is `/checkout/return`, and
 * it has to be: Cardcom navigates the payment iframe to the URL we handed it in
 * `SuccessRedirectUrl`, and that hop arrives before the webhook has necessarily
 * been delivered, so the landing page must be able to say "verifying" and poll.
 * `/checkout/return` is that page - it calls `reconcileOrderReturn`, renders the
 * pending state with `<AutoRefresh>`, and only shows the vouchers once the order
 * is really paid.
 *
 * `/checkout/success` exists because it is the address people type, link and
 * bookmark. Implementing it as a redirect rather than as a copy is the whole
 * point: two pages that both decide whether a payment settled would eventually
 * disagree, and the one that disagreed wrongly would tell a shopper their
 * payment failed after their card was charged.
 */
export default function CheckoutSuccessAlias(props: {
  searchParams: Promise<{ order_id?: string }>
}) {
  // The Suspense boundary is required, not stylistic. `cacheComponents` is on
  // (next.config.ts), and awaiting searchParams is an uncached read: outside a
  // boundary it fails `pnpm build`, a gate that type-check and lint both pass.
  // `/checkout/return` wraps its body for the same reason.
  return (
    <Suspense fallback={null}>
      <SuccessRedirect {...props} />
    </Suspense>
  )
}

async function SuccessRedirect({
  searchParams,
}: {
  // `null` and never actually rendered: both branches below leave via a thrown
  // navigation signal. Declared anyway because a component whose body only ever
  // throws is inferred as returning void, which is not a ReactNode.
  searchParams: Promise<{ order_id?: string }>
}): Promise<null> {
  const { order_id: orderId } = await searchParams
  // Without an order there is nothing to confirm, and `/checkout/return`
  // answers 404 for exactly the same reason. Answering it here too keeps the
  // alias from turning a missing parameter into a redirect loop's first hop.
  if (!orderId) notFound()
  redirect(`/checkout/return?order_id=${encodeURIComponent(orderId)}`)
}
