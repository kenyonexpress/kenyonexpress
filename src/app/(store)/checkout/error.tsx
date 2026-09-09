'use client'

import * as Sentry from '@sentry/nextjs'
import Link from 'next/link'
import { useEffect, useState } from 'react'

/**
 * The checkout boundary, and the only one that does not use
 * `SegmentErrorBoundary`.
 *
 * WHY THIS ONE IS DIFFERENT. Every other boundary in this app offers "נסו שוב"
 * as its primary action, because most render failures are transient and
 * retrying in place keeps the person where they were. **On the checkout route
 * that advice can cost the customer money.** By the time a throw is possible
 * here, the card may already have been charged: Cardcom takes the payment on
 * its own hosted page and the customer comes back to `/checkout/return`, where
 * `reconcileOrderReturn` is what decides whether an order exists. A failure
 * anywhere in that render is a failure of OUR page, not of the payment, and a
 * big "נסו שוב" button in front of somebody whose card has just been debited
 * invites a second debit.
 *
 * So the actions are inverted. The primary action carries the customer to the
 * page that can answer the only question they have -- did my payment go
 * through -- and the retry is demoted to a plain link. When an `order_id` is in
 * the URL the primary action is `/checkout/return?order_id=...`, because that
 * page re-verifies the settlement against the terminal itself rather than
 * trusting anything rendered here. Without one it is `/account/orders`, which
 * lists every order the customer has and answers the same question one click
 * later.
 *
 * THE COPY IS PART OF THE CONTROL, not decoration around it. "אל תשלמו שוב"
 * has to be readable before the buttons are, because the failure mode this file
 * exists for is a customer who pays twice in thirty seconds and then needs a
 * refund out of a Cardcom dashboard nobody on this machine can reach.
 *
 * The Sentry tag is `checkout` and it is worth alerting on separately: an error
 * rate here is not the same event as an error rate on a category page, however
 * similar the stack traces look.
 */
export default function CheckoutError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  // Read off `window.location` in an effect rather than with
  // `useSearchParams`. An `error.tsx` receives only `error` and `reset`, so the
  // id has to come from the URL either way, and `useSearchParams` puts the
  // route under Next's "must be wrapped in a Suspense boundary" rule -- which a
  // boundary file cannot satisfy from the inside, and which fails at BUILD
  // time rather than when this page is finally rendered. A boundary that
  // breaks the build is worse than one that resolves its link a tick late,
  // and the first paint below does not depend on the id.
  const [orderId, setOrderId] = useState<string | null>(null)
  useEffect(() => {
    setOrderId(new URLSearchParams(window.location.search).get('order_id'))
  }, [])

  useEffect(() => {
    Sentry.withScope((scope) => {
      scope.setTag('boundary', 'checkout')
      // Tagged, not just captured. The first question in triage is whether the
      // failure had an order behind it, and reading that off the URL after the
      // fact is not possible once the customer has navigated away.
      scope.setTag('has_order_id', orderId ? 'yes' : 'no')
      if (error.digest) scope.setTag('digest', error.digest)
      Sentry.captureException(error)
    })
    console.error('checkout error boundary:', error.digest ?? '', error)
  }, [error, orderId])

  // Falls back to the order list until the effect above has run, so the
  // primary action is never dead: /account/orders answers the same question
  // one click later and is correct for a customer with no id in the URL.
  const primaryHref = orderId
    ? `/checkout/return?order_id=${encodeURIComponent(orderId)}`
    : '/account/orders'

  return (
    <main dir="rtl" className="mx-auto flex max-w-lg flex-col items-center px-4 py-20 text-center">
      <p className="text-5xl" aria-hidden="true">
        ⚠️
      </p>
      <h1 className="mt-4 text-2xl font-bold text-heading">משהו השתבש בעמוד התשלום</h1>

      <p className="mt-4 rounded-xl bg-warning-surface px-4 py-3 text-sm font-bold leading-relaxed text-heading">
        אם החיוב כבר בוצע, ההזמנה שלכם קיימת. אל תשלמו שוב.
      </p>

      <p className="mt-3 text-sm leading-relaxed text-muted">
        התקלה היא בעמוד שלנו ולא בתשלום עצמו. בדקו את מצב ההזמנה לפני כל ניסיון נוסף.
      </p>

      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Link
          href={primaryHref}
          className="rounded-xl bg-heading px-6 py-3 text-sm font-bold text-white transition-opacity hover:opacity-90"
        >
          {orderId ? 'בדיקת מצב ההזמנה' : 'להזמנות שלי'}
        </Link>
      </div>

      {/* Deliberately a text link and not a button: retrying is legitimate when
          the customer has established nothing was charged, and it must not be
          the thing a thumb lands on first. */}
      <button
        type="button"
        onClick={reset}
        className="mt-4 text-sm text-muted underline underline-offset-4 transition-colors hover:text-heading"
      >
        לטעון מחדש את העמוד
      </button>

      {error.digest && (
        <p dir="ltr" className="mt-8 font-mono text-xs text-muted">
          {error.digest}
        </p>
      )}
    </main>
  )
}
