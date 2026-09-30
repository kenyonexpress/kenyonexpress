'use client'

import { currentUserId } from '@/server/actions/session'
import * as Sentry from '@sentry/nextjs'
import { useEffect } from 'react'

/**
 * Mirrors the signed-in customer into the browser Sentry client, as an id and
 * nothing else, so an error report can say WHICH signed-in customer hit it.
 * Without this every event from the two error boundaries is anonymous, and
 * "the customer who called support saw the crash page" cannot be matched to
 * the event that put them there.
 *
 * Only the UUID goes across - the same handle orders.user_id already carries -
 * never email or name. instrumentation-client.ts's beforeSend enforces that
 * even if this file ever regresses.
 *
 * THE ID COMES FROM A SERVER ACTION, NOT FROM THE BROWSER SUPABASE CLIENT.
 * Until 2026-10-01 this subscribed to `onAuthStateChange` on the browser
 * client, which read the session out of `document.cookie` at no network
 * cost. The session cookie is HttpOnly now (STEP 18, lib/auth/session-cookie.ts),
 * so that client sees no session and would tag every customer as anonymous.
 * `currentUserId` is one small POST answered from the verified cookie on the
 * server; it also drops the 62.8 KB gzipped Supabase browser bundle this
 * component used to lazy-load on every storefront route (measured 2026-09-17
 * with scripts/route-js-report.mjs).
 *
 * `requestIdleCallback` defers the request past the paint work that the
 * first idle period follows, so it stays off the LCP path the root layout's
 * comments guard; the 2s timeout bounds how long a busy main thread can
 * postpone it, so a customer who crashes within seconds of landing still
 * gets their id attached.
 *
 * Not consent-gated, deliberately: error reporting is already running before
 * the banner (it must be, or the errors most worth seeing are the ones lost),
 * and a pseudonymous id in a crash report is the same legitimate-interest
 * footing, unlike the marketing tags behind ThirdPartyTags.
 */
export default function SentryUserSync() {
  useEffect(() => {
    let cancelled = false

    const sync = () => {
      void currentUserId()
        .then((id) => {
          if (cancelled) return
          Sentry.setUser(id ? { id } : null)
        })
        .catch(() => {
          // A failed lookup tags nothing; it never becomes the page's error.
        })
    }

    const idle = typeof window.requestIdleCallback === 'function'
    const handle = idle
      ? window.requestIdleCallback(sync, { timeout: 2000 })
      : window.setTimeout(sync, 0)

    return () => {
      cancelled = true
      if (idle) window.cancelIdleCallback(handle)
      else window.clearTimeout(handle)
    }
  }, [])

  return null
}
