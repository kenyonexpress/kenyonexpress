'use client'

import * as Sentry from '@sentry/nextjs'
import { useEffect } from 'react'

/**
 * Mirrors the Supabase auth state into the browser Sentry client, as an id and
 * nothing else, so an error report can say WHICH signed-in customer hit it.
 * Without this every event from the two error boundaries is anonymous, and
 * "the customer who called support saw the crash page" cannot be matched to
 * the event that put them there.
 *
 * Only the UUID goes across - the same handle orders.user_id already carries -
 * never email or name. instrumentation-client.ts's beforeSend enforces that
 * even if this file ever regresses.
 *
 * No initial getUser()/getSession() call on purpose: onAuthStateChange fires
 * INITIAL_SESSION with the current session at subscribe time, so this adds
 * zero network requests to a page view - which is what lets it sit in the
 * root layout without touching the LCP budget the layout's comments guard.
 *
 * THE SUPABASE CLIENT IS IMPORTED LAZILY, AND THAT IS THE POINT OF THIS FILE'S
 * SHAPE. `@/lib/supabase/client` pulls `@supabase/ssr` and the whole
 * `@supabase/supabase-js` browser client (GoTrue included) into whichever
 * chunk imports it. Imported statically from a component the root layout
 * renders, that was 62.8 KB gzipped (243 KB raw) on the first load of EVERY
 * route -- measured with scripts/route-js-report.mjs on 2026-09-17: the
 * newsletter confirmation page, which has no auth UI at all, paid it too. No
 * other client component on a storefront route imports the Supabase client;
 * the account and MFA screens that do are behind their own segments. So this
 * one static import was the storefront's largest avoidable first-load cost.
 *
 * `import()` inside the effect moves that code into its own chunk, fetched
 * after hydration. `requestIdleCallback` defers the fetch past the paint work
 * that the first idle period follows; the 2s timeout bounds how long a busy
 * main thread can postpone it, so a customer who crashes within seconds of
 * landing still gets their id attached. Behaviour is otherwise identical:
 * INITIAL_SESSION still fires on subscribe, still no network request.
 *
 * Not consent-gated, deliberately: error reporting is already running before
 * the banner (it must be, or the errors most worth seeing are the ones lost),
 * and a pseudonymous id in a crash report is the same legitimate-interest
 * footing, unlike the marketing tags behind ThirdPartyTags.
 */
export default function SentryUserSync() {
  useEffect(() => {
    let cancelled = false
    let unsubscribe: (() => void) | null = null

    const subscribe = () => {
      void import('@/lib/supabase/client').then(({ createClient }) => {
        if (cancelled) return
        const {
          data: { subscription },
        } = createClient().auth.onAuthStateChange((_event, session) => {
          Sentry.setUser(session?.user ? { id: session.user.id } : null)
        })
        unsubscribe = () => subscription.unsubscribe()
      })
    }

    const idle = typeof window.requestIdleCallback === 'function'
    const handle = idle
      ? window.requestIdleCallback(subscribe, { timeout: 2000 })
      : window.setTimeout(subscribe, 0)

    return () => {
      cancelled = true
      if (idle) window.cancelIdleCallback(handle)
      else window.clearTimeout(handle)
      unsubscribe?.()
    }
  }, [])

  return null
}
