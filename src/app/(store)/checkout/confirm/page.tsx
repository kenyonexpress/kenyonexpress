import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'

/**
 * V03: `/checkout/confirm` is the name the visual queue gives the thank-you
 * page. The real route is `/checkout/return` (Cardcom lands there), and this is
 * a second alias beside `/checkout/confirmation`, built the same way: the
 * search params are read inside Suspense, because under cacheComponents an
 * awaited `searchParams` in the page shell refuses the prerender.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: true },
  alternates: { canonical: '/checkout/confirm' },
}

export default function CheckoutConfirmAlias(props: {
  searchParams: Promise<{ order_id?: string }>
}) {
  return (
    <Suspense fallback={null}>
      <CheckoutConfirmRedirect {...props} />
    </Suspense>
  )
}

async function CheckoutConfirmRedirect({
  searchParams,
}: {
  searchParams: Promise<{ order_id?: string }>
}) {
  const { order_id } = await searchParams
  const query = order_id ? `?order_id=${encodeURIComponent(order_id)}` : ''
  return redirect(`/checkout/return${query}`)
}
