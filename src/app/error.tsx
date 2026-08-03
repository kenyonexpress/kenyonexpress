'use client'

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
    // console, not the Sentry helpers in lib/observability: those run on
    // @sentry/node and tag everything area=payments, so importing them into a
    // client boundary would both fail to bundle and mislabel every UI error as
    // a money-path one. Wiring a browser SDK is a separate decision.
    //
    // The same reasoning now covers `lib/observability/log.ts`, which took over
    // the other 33 console call sites in src/ and deliberately did not take
    // this one: it reads its request id from node:async_hooks, which is a build
    // error in a client bundle. This line runs in the browser, where there is
    // no server request to correlate to and `digest` is the only handle that
    // ties it to the server-side event anyway.
    console.error('app error boundary:', error.digest ?? '', error)
  }, [error])

  return (
    <main dir="rtl" className="mx-auto flex max-w-lg flex-col items-center px-4 py-20 text-center">
      <p className="text-5xl" aria-hidden="true">
        ⚠️
      </p>
      <h1 className="mt-4 text-2xl font-bold text-gray-900">משהו השתבש אצלנו</h1>
      <p className="mt-2 text-sm leading-relaxed text-gray-500">
        התקלה נרשמה אצלנו ואנחנו מטפלים בה. אפשר לנסות לטעון את הדף מחדש.
      </p>

      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={reset}
          className="rounded-xl bg-gray-900 px-6 py-3 text-sm font-bold text-white transition-opacity hover:opacity-90"
        >
          נסו שוב
        </button>
        <Link
          href="/"
          className="rounded-xl border border-gray-300 px-6 py-3 text-sm font-bold text-gray-700 transition-colors hover:bg-gray-50"
        >
          לדף הבית
        </Link>
      </div>

      {error.digest && (
        <p dir="ltr" className="mt-8 font-mono text-xs text-gray-400">
          {error.digest}
        </p>
      )}
    </main>
  )
}
