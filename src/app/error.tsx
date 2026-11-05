'use client'

import ErrorPageFrame from '@/components/error-pages/ErrorPageFrame'
import { t } from '@/lib/i18n/messages'
import * as Sentry from '@sentry/nextjs'
import Link from 'next/link'
import { useEffect } from 'react'

/**
 * The 500 boundary for everything under the root layout.
 *
 * There was none, so any thrown server component rendered Next's default error
 * screen: English, LTR, and in production a bare "Application error" with no
 * route back. Given how many money-path reads in this codebase have turned out
 * to throw on a renamed column, the page a customer hits when one does is worth
 * having.
 *
 * `reset()` is offered first because a good share of these are transient - a
 * dropped database connection, a cold start - and retrying in place keeps the
 * customer where they were instead of sending them to the homepage to start
 * over.
 *
 * The digest is shown deliberately. It is the only handle support has on which
 * server-side error a caller actually hit; without it a report is "the site
 * broke" and nothing more. It carries no detail of its own, so showing it
 * leaks nothing.
 *
 * G7: branded through ErrorPageFrame (logo, local palette, support links).
 */

// Named AppError rather than Error: Next only cares that this file default
// exports the boundary, and calling it Error shadows the global inside its own
// props type.
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // The plain SDK, not the helpers in lib/observability: those run on
    // @sentry/node and tag everything area=payments, so importing them into a
    // client boundary would both fail to bundle and mislabel every UI error as
    // a money-path one. The browser SDK itself is already initialised by
    // instrumentation-client.ts, but its global handlers never see this error:
    // a boundary CATCHES it, so nothing reaches window.onerror, and without
    // this call a client-side render crash is invisible except to the one
    // customer looking at this page. `digest` is tagged because it is the only
    // handle that ties the browser event to the server-side one
    // onRequestError already reported.
    Sentry.withScope((scope) => {
      scope.setTag('boundary', 'app-error')
      if (error.digest) scope.setTag('digest', error.digest)
      Sentry.captureException(error)
    })

    // Kept alongside, not replaced: lib/observability/log.ts reads its request
    // id from node:async_hooks, which is a build error in a client bundle, so
    // this stays a bare console line. It is also what still works when the
    // DSN is unset and every Sentry call above is inert.
    console.error('app error boundary:', error.digest ?? '', error)
  }, [error])

  return (
    <ErrorPageFrame
      code="500"
      title={t('errorPages.errorTitle')}
      text={t('errorPages.errorText')}
      actions={
        <>
          <button type="button" onClick={reset} className="ke-error-page__btn">
            {t('errorPages.retry')}
          </button>
          <Link href="/" className="ke-error-page__btn--secondary">
            {t('errorPages.home')}
          </Link>
        </>
      }
    >
      {error.digest && (
        <p dir="ltr" className="ke-error-page__digest">
          {error.digest}
        </p>
      )}
    </ErrorPageFrame>
  )
}
