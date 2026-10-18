'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

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
  const [systemHealthy, setSystemHealthy] = useState<boolean | null>(null)
  const [checkingHealth, setCheckingHealth] = useState(false)

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

    // Check system health on mount
    const checkHealth = async () => {
      setCheckingHealth(true)
      try {
        const response = await fetch('/api/health', { cache: 'no-store' })
        setSystemHealthy(response.ok)
      } catch {
        setSystemHealthy(false)
      } finally {
        setCheckingHealth(false)
      }
    }
    checkHealth()
  }, [error])

  return (
    <main dir="rtl" className="mx-auto flex max-w-lg flex-col items-center px-4 py-20 text-center">
      {/* 500 in the brand yellow, matching not-found.tsx's 404. The two error
          pages used to look like they came from different sites: the 404 painted
          its numeral brand-primary while this one led with a grey emoji. A
          customer who hits both in one session sees one storefront. */}
      <p className="text-6xl font-black text-brand-primary" aria-hidden="true">
        500
      </p>
      <h1 className="mt-4 text-2xl font-bold text-heading">משהו השתבש אצלנו</h1>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        תקלה זמנית מנעה מאיתנו להציג את הדף. זה בדרך כלל בעיה מיידית שתתוקן תוך מספר דקות.
      </p>

      {/* System health status */}
      {systemHealthy !== null && (
        <div
          className={`mt-4 rounded-lg px-4 py-3 text-sm ${
            systemHealthy
              ? 'bg-green-50 text-green-800 border border-green-200'
              : 'bg-amber-50 text-amber-800 border border-amber-200'
          }`}
        >
          {systemHealthy
            ? '✓ השירותים שלנו פעילים. אנא נסו לטעון את הדף מחדש.'
            : '⚠ השירותים שלנו עשויים להיות בעדכון. אנא נסו שוב בעוד כמה דקות.'}
        </div>
      )}
      {checkingHealth && <div className="mt-4 text-sm text-muted">בדיקת מצב השירותים...</div>}

      <div className="mt-8 flex flex-col gap-3 w-full">
        <button
          type="button"
          onClick={reset}
          className="rounded-xl bg-gray-900 px-6 py-3 text-sm font-bold text-white transition-opacity hover:opacity-90 w-full"
        >
          נסו שוב
        </button>
        <div className="flex flex-wrap gap-3 justify-center">
          <Link
            href="/products"
            className="rounded-xl border border-border px-6 py-3 text-sm font-bold text-heading transition-colors hover:bg-surface-hover"
          >
            לכל המוצרים
          </Link>
          <Link
            href="/"
            className="rounded-xl px-6 py-3 text-sm font-bold text-muted transition-colors hover:text-heading"
          >
            לדף הבית
          </Link>
        </div>
      </div>

      {/* Support options */}
      <div className="mt-8 border-t border-border pt-8 w-full">
        <p className="text-xs text-muted mb-4">צריכים עזרה נוספת?</p>
        <div className="flex flex-col gap-2">
          <Link
            href="/contact"
            className="rounded-lg bg-brand-primary px-4 py-2 text-sm font-semibold text-heading transition-opacity hover:opacity-90"
          >
            צרו קשר עם התמיכה שלנו
          </Link>
          <button
            type="button"
            onClick={async () => {
              setCheckingHealth(true)
              try {
                const response = await fetch('/api/health', { cache: 'no-store' })
                setSystemHealthy(response.ok)
              } catch {
                setSystemHealthy(false)
              } finally {
                setCheckingHealth(false)
              }
            }}
            className="rounded-lg border border-muted px-4 py-2 text-sm font-semibold text-muted transition-colors hover:text-heading hover:border-heading"
            disabled={checkingHealth}
          >
            {checkingHealth ? 'בודקים...' : 'בדקו את מצב השירותים'}
          </button>
        </div>
      </div>

      {error.digest && (
        <p dir="ltr" className="mt-8 font-mono text-xs text-muted">
          {error.digest}
        </p>
      )}
    </main>
  )
}
