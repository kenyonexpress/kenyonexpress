'use client'

import { CONSENT_COOKIE, browserDoNotTrack } from '@/lib/analytics/consent'
import {
  REPLAY_OPTIN_CHANGED_EVENT,
  REPLAY_OPTIN_COOKIE,
  isReplayAllowed,
} from '@/lib/analytics/replay-optin'
import {
  BUGGY_SESSION_EVENT,
  type BugSignalReason,
  bindBugSignals,
  isBugSignalReason,
  readBuggySession,
} from '@/lib/analytics/replay-trigger'
import { currentDistinctId, isPostHogEnabled } from '@/lib/observability/posthog'
import { useEffect, useRef, useState } from 'react'
import { CONSENT_GRANTED_EVENT } from './ThirdPartyTags'

/**
 * Session replay for support debugging, and ONLY that, and only of sessions
 * where something broke.
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
 * THREE GATES, ALL REQUIRED. The banner consent covers PostHog receiving
 * behavioral data at all, and the browser's Do Not Track / GPC signal vetoes
 * it; the replay opt-in cookie (flipped in the account area, see
 * lib/analytics/replay-optin.ts for why it is separate) covers the recording
 * specifically. A declined banner, a DNT browser or an untouched opt-in all
 * mean no SDK is ever downloaded, not an SDK that politely does not record.
 *
 * The third gate is the bug signal (lib/analytics/replay-trigger.ts). With
 * the first two passed, the SDK is mounted with recording DISABLED, and the
 * recorder starts only when this tab reports an uncaught error, an unhandled
 * rejection or an error boundary -- or when the tab was already flagged by an
 * earlier page. Ordinary shopping by an opted-in shopper is never on tape.
 * The start is announced with a `replay_started` event through the SDK, so
 * "sessions with a recording" is one filter in PostHog, with the reason on it.
 *
 * Recording stops meaning anything without masking: all inputs are masked, so
 * a card form or a password field records as asterisks even if a future
 * refactor forgets this file exists.
 *
 * Opting OUT mid-page stops an already-running recording immediately; the SDK
 * itself stays parked so events keep their $session_id linkage until the next
 * navigation tears it down.
 */

type ParkedClient = {
  capture?: (event: string, properties?: Record<string, unknown>) => void
  startSessionRecording?: (override?: Record<string, boolean>) => void
  stopSessionRecording?: () => void
}

function parkedClient(): ParkedClient | undefined {
  return (window as unknown as { __ke_posthog?: ParkedClient }).__ke_posthog
}

/**
 * Every control the SDK could be configured with remotely (sampling, a
 * linked flag, URL and event triggers) is overridden: the local bug signal is
 * the decision, and a project setting must not be able to silently keep a
 * flagged session off tape.
 */
const START_OVERRIDES = {
  sampling: true,
  linked_flag: true,
  url_trigger: true,
  event_trigger: true,
}

/**
 * One `replay_started` per mount, however many of the paths below reach a
 * parked client. The ref belongs to the component; the function does not,
 * so the effects that call it have no closure to list as a dependency.
 */
function startOnce(
  started: { current: boolean },
  client: ParkedClient,
  reason: BugSignalReason,
): void {
  if (started.current) return
  started.current = true
  startRecording(client, reason)
}

function startRecording(client: ParkedClient, reason: BugSignalReason): void {
  try {
    client.startSessionRecording?.(START_OVERRIDES)
    client.capture?.('replay_started', { reason, $lib: 'kenyonexpress-fetch' })
  } catch {
    // The recorder failing to start must not break the page that just broke.
  }
}

export default function PostHogReplay() {
  const [allowed, setAllowed] = useState(false)
  const [bugReason, setBugReason] = useState<BugSignalReason | null>(null)
  // Mirrors `bugReason` for the SDK's `loaded` callback, which closes over
  // the render it was created in; and the once-per-mount latch for startOnce.
  const bugReasonRef = useRef<BugSignalReason | null>(null)
  const startedRef = useRef(false)

  useEffect(() => {
    const readCookie = (name: string) => {
      const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`))
      return match?.[1] ? decodeURIComponent(match[1]) : null
    }
    const check = () =>
      setAllowed(
        !browserDoNotTrack() &&
          isReplayAllowed(readCookie(CONSENT_COOKIE), readCookie(REPLAY_OPTIN_COOKIE)),
      )
    check()
    window.addEventListener(CONSENT_GRANTED_EVENT, check)
    window.addEventListener(REPLAY_OPTIN_CHANGED_EVENT, check)
    return () => {
      window.removeEventListener(CONSENT_GRANTED_EVENT, check)
      window.removeEventListener(REPLAY_OPTIN_CHANGED_EVENT, check)
    }
  }, [])

  // The bug listeners exist only once both consent gates pass: a visitor who
  // declined pays for no listener, and a flag raised while declined would be
  // a flag nobody could act on anyway.
  useEffect(() => {
    if (!allowed) return
    const stored = readBuggySession()
    bugReasonRef.current ??= stored
    setBugReason((current) => current ?? stored)
    const onSignal = (event: Event) => {
      const detail = (event as CustomEvent<{ reason?: unknown }>).detail?.reason
      const reason = isBugSignalReason(detail) ? detail : 'uncaught_error'
      bugReasonRef.current ??= reason
      setBugReason((current) => current ?? reason)
    }
    window.addEventListener(BUGGY_SESSION_EVENT, onSignal)
    const unbind = bindBugSignals(window)
    return () => {
      window.removeEventListener(BUGGY_SESSION_EVENT, onSignal)
      unbind()
    }
  }, [allowed])

  useEffect(() => {
    const parked = parkedClient()
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
          // Off at mount. The recorder starts from the bug signal below and
          // nowhere else; "buggy sessions only" is this line.
          disable_session_recording: true,
          // Belt and braces with the gate above: the SDK's own DNT check.
          respect_dnt: true,
          session_recording: {
            maskAllInputs: true,
          },
          // One person across both pipelines: the id the fetch path mints and
          // mirrors is handed to the SDK before its first byte goes out.
          bootstrap: { distinctID: currentDistinctId() },
          persistence: 'localStorage',
          loaded: (client) => {
            ;(window as unknown as { __ke_posthog?: unknown }).__ke_posthog = client
            // The flag may have been raised before the chunk arrived (an
            // error during this very page load is the common case).
            const pending = bugReasonRef.current ?? readBuggySession()
            if (pending) startOnce(startedRef, client as unknown as ParkedClient, pending)
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

  // The signal arrived with the SDK already parked: start now.
  useEffect(() => {
    if (!allowed || !bugReason) return
    const client = parkedClient()
    if (client) startOnce(startedRef, client, bugReason)
  }, [allowed, bugReason])

  return null
}
