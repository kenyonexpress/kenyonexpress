'use client'

import { markSessionBuggy } from '@/lib/analytics/replay-trigger'
import { STATUS_PATH } from '@/lib/health/public-status'
import { withSentry } from '@/lib/observability/sentry-browser'
import { storeWhatsAppLink } from '@/lib/whatsapp'
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
 * UX26: the two offers the full 500 page makes are here too, as plain links
 * that need no JavaScript and no stylesheet: the status page (a static shell
 * under the root layout, so it stands when this page is up) and WhatsApp
 * with the digest already in the message. No health probe here: the layout
 * is gone, and a fetch from the last boundary is one more thing to fail.
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

  const whatsapp = storeWhatsAppLink(
    `שלום, נתקלתי בתקלה באתר קניון אקספרס.${error.digest ? `\nקוד תקלה: ${error.digest}` : ''}`,
  )

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

          <div
            style={{
              marginTop: '2rem',
              display: 'flex',
              flexWrap: 'wrap',
              justifyContent: 'center',
              gap: '0.75rem',
            }}
          >
            <a
              href="/"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                minHeight: '44px',
                borderRadius: '999px',
                background: '#111',
                color: '#fff',
                padding: '0 1.5rem',
                fontSize: '0.875rem',
                fontWeight: 700,
                textDecoration: 'none',
              }}
            >
              לדף הבית
            </a>
            <a
              href={STATUS_PATH}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                minHeight: '44px',
                borderRadius: '999px',
                border: '1px solid #ccc',
                color: '#111',
                padding: '0 1.5rem',
                fontSize: '0.875rem',
                fontWeight: 700,
                textDecoration: 'none',
              }}
            >
              מצב המערכת
            </a>
            {whatsapp ? (
              <a
                href={whatsapp}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  minHeight: '44px',
                  borderRadius: '999px',
                  background: '#25d366',
                  color: '#fff',
                  padding: '0 1.5rem',
                  fontSize: '0.875rem',
                  fontWeight: 700,
                  textDecoration: 'none',
                }}
              >
                פנייה לתמיכה בוואטסאפ
              </a>
            ) : null}
          </div>

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
