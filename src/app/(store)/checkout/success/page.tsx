import { notFound, redirect } from 'next/navigation'

/**
 * `/checkout/success` is an ALIAS, not a second confirmation page.
 *
 * The page a shopper actually lands on after paying is `/checkout/return`, and
 * it has to be: Cardcom navigates the payment iframe to the URL we handed it in
 * `SuccessRedirectUrl`, and that hop arrives before the webhook has necessarily
 * been delivered, so the landing page must be able to say "verifying" and poll.
 * `/checkout/return` is that page — it calls `reconcileOrderReturn`, renders the
 * pending state with `<AutoRefresh>`, and only shows the vouchers once the order
 * is really paid.
 *
 * `/checkout/success` exists because it is the address people type, link and
 * bookmark. Implementing it as a redirect rather than as a copy is the whole
 * point: two pages that both decide whether a payment settled would eventually
 * disagree, and the one that disagreed wrongly would tell a shopper their
 * payment failed after their card was charged.
 */
export default async function CheckoutSuccessAlias({
  searchParams,
}: {
  searchParams: Promise<{ order_id?: string }>
}) {
  const { order_id: orderId } = await searchParams
  // Without an order there is nothing to confirm, and `/checkout/return`
  // answers 404 for exactly the same reason. Answering it here too keeps the
  // alias from turning a missing parameter into a redirect loop's first hop.
  if (!orderId) notFound()
  redirect(`/checkout/return?order_id=${encodeURIComponent(orderId)}`)
}
