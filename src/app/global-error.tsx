'use client'

import { DEFAULT_CONTACT_EMAIL } from '@/lib/contact-address'
import { t } from '@/lib/i18n/messages'
import { PUBLISHED_STORE_WHATSAPP } from '@/lib/whatsapp'
import * as Sentry from '@sentry/nextjs'
import { type CSSProperties, useEffect } from 'react'

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
 * stylesheet not loading, so this page cannot depend on one. That is also why
 * it does not use ErrorPageFrame, which the 404, the 500 and the offline page
 * share: the frame's look lives in error-pages.css.
 *
 * S33 (06.11.2026): it now LOOKS like those three, by carrying the same values
 * inline (the palette below is error-pages.css's, which is Electro's: brand
 * yellow, heading ink, body ink, rule), and it offers what they offer: the
 * logo, a retry, a way home, and support by mail and WhatsApp. Before this it
 * was a black button under a warning emoji, the one screen in the shop that
 * was not in the shop's colours. The copy comes from the same catalog keys as
 * the 500, so the two cannot drift.
 *
 * The retry is `reset()`, offered first for the reason error.tsx gives: a good
 * share of these are transient. Home is a plain <a>, not a router link: the
 * router lives under the layout that just failed, and a full document load is
 * the one navigation that does not depend on it.
 */

// Electro's values as the storefront measures them. Kept in step with
// src/styles/error-pages.css by global-error.test.ts, which reads both files.
const PRIMARY = '#fed700'
const HEADING = '#333e48'
const BODY = '#6f6f6f'
const RULE = '#ddd'
const SURFACE = '#fff'
const TOUCH = 44

const button: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: TOUCH,
  padding: '0 1.5rem',
  borderRadius: 50,
  fontFamily: 'inherit',
  fontWeight: 700,
  fontSize: 14,
  textDecoration: 'none',
  cursor: 'pointer',
}

const supportLink: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  minHeight: TOUCH,
  paddingInline: '0.5rem',
  color: HEADING,
  textDecoration: 'underline',
  textUnderlineOffset: 3,
}

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Tagged like the other boundaries, so a root-layout failure is separable
    // in Sentry from a page-level one instead of landing in the same pile.
    Sentry.withScope((scope) => {
      scope.setTag('boundary', 'global-error')
      if (error.digest) scope.setTag('digest', error.digest)
      Sentry.captureException(error)
    })
  }, [error])

  return (
    <html lang="he" dir="rtl">
      {/* The layout that would have set the title is the one that failed, and
          a global-error file cannot export metadata. Without this the tab and
          the screen reader announce a document with no name. */}
      <head>
        <title>{t('errorPages.errorTitle')}</title>
      </head>
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'system-ui, -apple-system, "Segoe UI", Arial, sans-serif',
          fontSize: 14,
          lineHeight: 1.7,
          background: SURFACE,
          color: HEADING,
        }}
      >
        <main
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            maxWidth: '36rem',
            padding: '3rem 1rem 4rem',
            textAlign: 'center',
          }}
        >
          {/* A plain <img>, as in ErrorPageFrame: the optimizer route is one of
              the things that can be down when this page shows. */}
          <img
            src="/images/logo.webp"
            alt={t('errorPages.logoAlt')}
            width={380}
            height={100}
            style={{ width: 190, height: 'auto', marginBottom: '1.5rem' }}
          />
          <p
            aria-hidden="true"
            style={{
              margin: 0,
              paddingInline: '0.2em',
              fontSize: '4rem',
              fontWeight: 900,
              lineHeight: 1,
              color: HEADING,
              boxShadow: `inset 0 -0.36em 0 ${PRIMARY}`,
            }}
          >
            500
          </p>
          <h1 style={{ margin: '1rem 0 0', fontSize: '1.5rem', fontWeight: 700, color: HEADING }}>
            {t('errorPages.errorTitle')}
          </h1>
          <p style={{ margin: '0.5rem 0 0', color: BODY }}>{t('errorPages.errorText')}</p>

          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              justifyContent: 'center',
              gap: '0.75rem',
              marginTop: '2rem',
            }}
          >
            <button
              type="button"
              onClick={reset}
              style={{
                ...button,
                background: PRIMARY,
                color: HEADING,
                border: `1px solid ${PRIMARY}`,
              }}
            >
              {t('errorPages.retry')}
            </button>
            <a
              href="/"
              style={{
                ...button,
                background: 'transparent',
                color: HEADING,
                border: `1px solid ${RULE}`,
              }}
            >
              {t('errorPages.home')}
            </a>
          </div>

          {error.digest && (
            <p
              dir="ltr"
              style={{
                margin: '1.5rem 0 0',
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                fontSize: 12,
                color: BODY,
              }}
            >
              {error.digest}
            </p>
          )}

          <p
            style={{
              width: '100%',
              margin: '2rem 0 0',
              paddingTop: '1.25rem',
              borderTop: `1px solid ${RULE}`,
              color: BODY,
            }}
          >
            {t('errorPages.supportLead')}{' '}
            <a href={`mailto:${DEFAULT_CONTACT_EMAIL}`} style={supportLink}>
              {t('errorPages.supportEmail')}
            </a>
            {' · '}
            <a
              href={`https://wa.me/${PUBLISHED_STORE_WHATSAPP}`}
              rel="noreferrer noopener"
              target="_blank"
              style={supportLink}
            >
              {t('errorPages.supportWhatsApp')}
            </a>
          </p>
        </main>
      </body>
    </html>
  )
}
