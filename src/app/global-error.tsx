'use client'

import { markSessionBuggy } from '@/lib/analytics/replay-trigger'
import { withSentry } from '@/lib/observability/sentry-browser'
import { useEffect } from 'react'

/**
 * The last boundary. Catches errors thrown in the ROOT LAYOUT itself, which
 * error.tsx cannot: that boundary lives inside the layout, so a layout that
 * throws takes the boundary with it.
 *
 * Because the layout failed, this file must supply its own <html> and <body>,
 * and with them the lang and dir the layout would have set. Without them Next's
 * fallback renders an English LTR screen to a Hebrew audience at the exact
 * moment the site is already broken.
 *
 * Styles are inline for the same reason: a failure this deep may well be the
 * stylesheet not loading, so this page cannot depend on one.
 */
export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string }
}) {
  useEffect(() => {
    // On demand, like error.tsx: the SDK is not in the first-load graph and a
    // layout crash is exactly when it is worth one more request.
    withSentry((Sentry) => Sentry.captureException(error))
    // The root layout is gone and the recorder with it, so this cannot start a
    // recording now; the flag survives in sessionStorage and the next page
    // the shopper reaches in this tab records from its first paint.
    markSessionBuggy('global_error_boundary')
  }, [error])

  return (
    <html lang="he" dir="rtl">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          background: '#fff',
          color: '#111',
        }}
      >
        <main style={{ maxWidth: '32rem', padding: '2rem', textAlign: 'center' }}>
          <p style={{ fontSize: '3rem', margin: 0 }} aria-hidden="true">
            ⚠️
          </p>
          <h1 style={{ fontSize: '1.5rem', margin: '1rem 0 0.5rem' }}>משהו השתבש אצלנו</h1>
          <p style={{ color: '#666', fontSize: '0.9rem', lineHeight: 1.6, margin: 0 }}>
            התקלה נרשמה ואנחנו מטפלים בה. אפשר לנסות שוב בעוד רגע.
          </p>

          <button
            type="button"
            onClick={() => window.location.assign('/')}
            style={{
              marginTop: '2rem',
              borderRadius: '0.75rem',
              border: 'none',
              background: '#111',
              color: '#fff',
              padding: '0.75rem 1.5rem',
              fontSize: '0.875rem',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            לדף הבית
          </button>

          {error.digest && (
            <p
              dir="ltr"
              style={{
                marginTop: '2rem',
                fontFamily: 'ui-monospace, monospace',
                fontSize: '0.75rem',
                color: '#999',
              }}
            >
              {error.digest}
            </p>
          )}
        </main>
      </body>
    </html>
  )
}
