'use client'

import { SITE } from '@/styles/tokens'
import * as Sentry from '@sentry/nextjs'
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
 *
 * WHICH IS WHY THE YELLOW IS A LITERAL AND THE FONT IS NOT HEEBO.
 *
 * The brand colour survives a dead stylesheet - it is a value, and it is
 * imported from `styles/tokens.ts`, which is plain data with no CSS import
 * behind it, so this stays in step with the site without depending on anything
 * loading. `tokens.test.ts` already pins that value against the stylesheet.
 *
 * The typeface cannot make the same trip. Heebo arrives through `next/font` as
 * a class on <html> set by the ROOT LAYOUT - the very thing that just threw. A
 * font-family naming it here would resolve to nothing and fall back anyway,
 * so the fallback is named honestly instead.
 */
export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string }
}) {
  useEffect(() => {
    Sentry.captureException(error)
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
          <p
            style={{
              fontSize: '3.75rem',
              lineHeight: 1,
              fontWeight: 900,
              margin: 0,
              color: SITE.brand.primary,
            }}
            aria-hidden="true"
          >
            500
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
