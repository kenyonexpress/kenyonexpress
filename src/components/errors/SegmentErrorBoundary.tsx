'use client'

import * as Sentry from '@sentry/nextjs'
import Link from 'next/link'
import { useEffect } from 'react'

/**
 * The shared body of every per-segment `error.tsx`.
 *
 * WHY SEGMENTS NEED THEIR OWN. Until now the only boundary under the root
 * layout was `src/app/error.tsx`, so every thrown server component in every
 * area rendered the same storefront apology whose primary escape is "לדף
 * הבית". That is the right page for a shopper on a category listing and the
 * wrong one everywhere else:
 *
 *   (supplier)  a supplier is standing at a till with a customer in front of
 *               them. Sending them to the storefront home page ends the
 *               redemption they were in the middle of.
 *   (admin)     an operator loses the panel and has to navigate back in.
 *   (account)   the customer is thrown out of their own account area.
 *   checkout    THE CARD MAY ALREADY HAVE BEEN CHARGED. See that file; the
 *               difference there is not cosmetic.
 *
 * WHAT A SEGMENT BOUNDARY DOES NOT CATCH, because getting this wrong is how a
 * boundary comes to be believed in: an `error.tsx` catches throws from its
 * segment's children, NOT from the layout of its own segment. An error inside
 * `(admin)/layout.tsx` itself still goes to `global-error.tsx`. Each of these
 * files sits beside the layout it protects the children of.
 *
 * REPORTING IS IDENTICAL TO THE ROOT BOUNDARY and deliberately duplicated
 * rather than imported from `lib/observability`: those helpers run on
 * `@sentry/node` and tag everything `area=payments`, so importing them into a
 * client boundary would both fail to bundle and mislabel every UI error as a
 * money-path one. The `boundary` tag is what makes the segments separable in
 * Sentry; without it all five report as one undifferentiated pile.
 */
export function SegmentErrorBoundary({
  error,
  reset,
  boundary,
  title,
  body,
  retryLabel = 'נסו שוב',
  homeHref,
  homeLabel,
}: {
  error: Error & { digest?: string }
  reset: () => void
  /** Sentry tag. Keep it equal to the route group, so a spike names its area. */
  boundary: string
  title: string
  body: string
  retryLabel?: string
  /** Where "somewhere safe" is for THIS area. Never assume the storefront. */
  homeHref: string
  homeLabel: string
}) {
  useEffect(() => {
    // A boundary CATCHES the error, so nothing reaches window.onerror and the
    // browser SDK's global handlers never see it. Without this call a render
    // crash is invisible to everyone except the one person looking at it.
    Sentry.withScope((scope) => {
      scope.setTag('boundary', boundary)
      if (error.digest) scope.setTag('digest', error.digest)
      Sentry.captureException(error)
    })

    // Kept alongside and not replaced: `lib/observability/log.ts` reads its
    // request id from `node:async_hooks`, which is a build error in a client
    // bundle. This is also what still works when the DSN is unset and every
    // Sentry call above is inert.
    console.error(`${boundary} error boundary:`, error.digest ?? '', error)
  }, [error, boundary])

  return (
    <main dir="rtl" className="mx-auto flex max-w-lg flex-col items-center px-4 py-20 text-center">
      <p className="text-5xl" aria-hidden="true">
        ⚠️
      </p>
      <h1 className="mt-4 text-2xl font-bold text-heading">{title}</h1>
      <p className="mt-2 text-sm leading-relaxed text-muted">{body}</p>

      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={reset}
          className="rounded-xl bg-heading px-6 py-3 text-sm font-bold text-white transition-opacity hover:opacity-90"
        >
          {retryLabel}
        </button>
        <Link
          href={homeHref}
          className="rounded-xl border border-border px-6 py-3 text-sm font-bold text-heading transition-colors hover:bg-surface-hover"
        >
          {homeLabel}
        </Link>
      </div>

      {/* dir="ltr" on the digest alone: it is a hex string, and inside an RTL
          paragraph a bidi reorder would show the operator a different string
          from the one in Sentry. */}
      {error.digest && (
        <p dir="ltr" className="mt-8 font-mono text-xs text-muted">
          {error.digest}
        </p>
      )}
    </main>
  )
}
