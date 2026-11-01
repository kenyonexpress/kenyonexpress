'use client'

import { CONSENT_COOKIE } from '@/lib/analytics/consent'
import {
  REPLAY_OPTIN_CHANGED_EVENT,
  REPLAY_OPTIN_COOKIE,
  isReplayAllowed,
} from '@/lib/analytics/replay-optin'
import { currentDistinctId, isPostHogEnabled } from '@/lib/observability/posthog'
import { useEffect, useState } from 'react'
import { CONSENT_GRANTED_EVENT } from './ThirdPartyTags'

/**
 * Session replay for support debugging, and ONLY that.
 *
 * Event capture in this app is deliberately SDK-free (see
 * lib/observability/posthog.ts), but a replay cannot be a fetch call: it is a
 * DOM recorder, and only posthog-js has one. So the SDK is a lazy, consent-
 * gated guest with one job. Everything that would make it a second event
 * pipeline is switched off (no autocapture, no SDK pageview, no exception
 * capture) and it is bootstrapped with the SAME distinct id the fetch path
 * keys on, so a recording and the events land on one person, not two.
 *
 * Once mounted, the client is parked on `window.__ke_posthog`, and trackEvent
 * routes through it: an event sent via the SDK carries `$session_id`, which is
 * what lets support click from a complaint to the exact moment in the
 * recording.
 *
 * TWO GATES, BOTH REQUIRED. The banner consent covers PostHog receiving
 * behavioral data at all; the replay opt-in cookie (flipped in the account
 * area, see lib/analytics/replay-optin.ts for why it is separate) covers the
 * recording specifically. A declined banner or an untouched opt-in both mean
 * no recorder is ever downloaded, not a recorder that politely does not
 * record. Recording stops meaning anything without masking: all inputs are
 * masked, so a card form or a password field records as asterisks even if a
 * future refactor forgets this file exists.
 *
 * Opting OUT mid-page stops an already-running recording immediately; the SDK
 * itself stays parked so events keep their $session_id linkage until the next
 * navigation tears it down.
 */
export default function PostHogReplay() {
  const [allowed, setAllowed] = useState(false)

  useEffect(() => {
    const readCookie = (name: string) => {
      const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`))
      return match?.[1] ? decodeURIComponent(match[1]) : null
    }
    const check = () =>
      setAllowed(isReplayAllowed(readCookie(CONSENT_COOKIE), readCookie(REPLAY_OPTIN_COOKIE)))
    check()
    window.addEventListener(CONSENT_GRANTED_EVENT, check)
    window.addEventListener(REPLAY_OPTIN_CHANGED_EVENT, check)
    return () => {
      window.removeEventListener(CONSENT_GRANTED_EVENT, check)
      window.removeEventListener(REPLAY_OPTIN_CHANGED_EVENT, check)
    }
  }, [])

  useEffect(() => {
    const parked = (window as unknown as { __ke_posthog?: { stopSessionRecording?: () => void } })
      .__ke_posthog
    if (!allowed) {
      // A recorder that is already running must stop the moment the shopper
      // says stop, not at the next page load.
      try {
        parked?.stopSessionRecording?.()
      } catch {
        // The SDK failing to stop cleanly must not break the page.
      }
      return
    }
    if (!isPostHogEnabled()) return
    if (parked) return

    let cancelled = false
    void import('posthog-js')
      .then(({ default: posthog }) => {
        if (cancelled) return
        posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY as string, {
          api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com',
          // The fetch path owns the event stream; the SDK owns the recorder.
          autocapture: false,
          capture_pageview: false,
          capture_pageleave: false,
          capture_exceptions: false,
          disable_session_recording: false,
          session_recording: {
            maskAllInputs: true,
          },
          // One person across both pipelines: the id the fetch path mints and
          // mirrors is handed to the SDK before its first byte goes out.
          bootstrap: { distinctID: currentDistinctId() },
          persistence: 'localStorage',
          loaded: (client) => {
            ;(window as unknown as { __ke_posthog?: unknown }).__ke_posthog = client
          },
        })
      })
      .catch(() => {
        // An ad blocker eating the chunk must not break the page. The fetch
        // path keeps sending events; only the recording is lost.
      })
    return () => {
      cancelled = true
    }
  }, [allowed])

  return null
}
