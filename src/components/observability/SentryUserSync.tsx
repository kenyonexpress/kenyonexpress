'use client'

import { createClient } from '@/lib/supabase/client'
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
 * Not consent-gated, deliberately: error reporting is already running before
 * the banner (it must be, or the errors most worth seeing are the ones lost),
 * and a pseudonymous id in a crash report is the same legitimate-interest
 * footing, unlike the marketing tags behind ThirdPartyTags.
 */
export default function SentryUserSync() {
  useEffect(() => {
    const supabase = createClient()
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      Sentry.setUser(session?.user ? { id: session.user.id } : null)
    })
    return () => subscription.unsubscribe()
  }, [])

  return null
}
