/**
 * @vitest-environment jsdom
 */
import { CONSENT_COOKIE, CONSENT_WORDING_VERSION } from '@/lib/analytics/consent'
import {
  REPLAY_OPTIN_CHANGED_EVENT,
  REPLAY_OPTIN_COOKIE,
  REPLAY_OPTIN_VALUE,
} from '@/lib/analytics/replay-optin'
import { render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * A recorder is the most invasive thing this app can mount, so the tests are
 * about what does NOT happen: no SDK download before consent, without the
 * explicit replay opt-in, or without a key; and when it does mount, no second
 * event pipeline -- autocapture and the SDK pageview stay off, inputs stay
 * masked, and the identity is the one the fetch path already keys events on.
 */

const init = vi.hoisted(() => vi.fn())

vi.mock('posthog-js', () => ({
  default: {
    init: (...args: unknown[]) => {
      init(...args)
      // The component parks the client from the `loaded` callback; hand it one.
      const options = args[1] as { loaded?: (client: unknown) => void }
      options.loaded?.({ capture: vi.fn() })
    },
  },
}))

const isPostHogEnabled = vi.hoisted(() => vi.fn(() => true))

vi.mock('@/lib/observability/posthog', () => ({
  isPostHogEnabled: () => isPostHogEnabled(),
  currentDistinctId: () => 'stable-browser-id',
}))

import PostHogReplay from './PostHogReplay'
import { CONSENT_GRANTED_EVENT } from './ThirdPartyTags'

const parkedWindow = window as unknown as {
  __ke_posthog?: { capture?: unknown; stopSessionRecording?: unknown }
}

function grantConsent(): void {
  document.cookie = `${CONSENT_COOKIE}=${encodeURIComponent(`granted.${CONSENT_WORDING_VERSION}`)}`
}

function optInToReplay(): void {
  document.cookie = `${REPLAY_OPTIN_COOKIE}=${REPLAY_OPTIN_VALUE}`
}

function clearCookies(): void {
  document.cookie = `${CONSENT_COOKIE}=; expires=Thu, 01 Jan 1970 00:00:00 GMT`
  document.cookie = `${REPLAY_OPTIN_COOKIE}=; expires=Thu, 01 Jan 1970 00:00:00 GMT`
}

beforeEach(() => {
  init.mockReset()
  isPostHogEnabled.mockReset().mockReturnValue(true)
  clearCookies()
  parkedWindow.__ke_posthog = undefined
})

afterEach(() => {
  clearCookies()
  parkedWindow.__ke_posthog = undefined
})

async function settle(): Promise<void> {
  // The SDK arrives through a dynamic import; give the promise chain a tick.
  await new Promise((resolve) => setTimeout(resolve, 0))
}

describe('PostHogReplay', () => {
  it('downloads nothing before the banner is answered', async () => {
    optInToReplay()
    render(<PostHogReplay />)
    await settle()
    expect(init).not.toHaveBeenCalled()
  })

  it('downloads nothing on banner consent alone: replay needs its own yes', async () => {
    grantConsent()
    render(<PostHogReplay />)
    await settle()
    expect(init).not.toHaveBeenCalled()
  })

  it('downloads nothing without a key, even fully opted in', async () => {
    grantConsent()
    optInToReplay()
    isPostHogEnabled.mockReturnValue(false)
    render(<PostHogReplay />)
    await settle()
    expect(init).not.toHaveBeenCalled()
  })

  it('mounts the recorder as a recorder only, on the shared identity', async () => {
    grantConsent()
    optInToReplay()
    render(<PostHogReplay />)

    await waitFor(() => expect(init).toHaveBeenCalledTimes(1))
    const options = init.mock.calls[0]?.[1] as Record<string, unknown>
    expect(options).toMatchObject({
      autocapture: false,
      capture_pageview: false,
      capture_pageleave: false,
      capture_exceptions: false,
      disable_session_recording: false,
      session_recording: { maskAllInputs: true },
      bootstrap: { distinctID: 'stable-browser-id' },
    })
    // Parked for trackEvent to route events through, which is what stamps
    // $session_id on them.
    await waitFor(() => expect(parkedWindow.__ke_posthog).toBeDefined())
  })

  it('mounts when the opt-in arrives after render, via the toggle event', async () => {
    grantConsent()
    render(<PostHogReplay />)
    await settle()
    expect(init).not.toHaveBeenCalled()

    optInToReplay()
    window.dispatchEvent(new Event(REPLAY_OPTIN_CHANGED_EVENT))

    await waitFor(() => expect(init).toHaveBeenCalledTimes(1))
  })

  it('mounts when consent arrives after render, via the banner event', async () => {
    optInToReplay()
    render(<PostHogReplay />)
    await settle()
    expect(init).not.toHaveBeenCalled()

    grantConsent()
    window.dispatchEvent(new Event(CONSENT_GRANTED_EVENT))

    await waitFor(() => expect(init).toHaveBeenCalledTimes(1))
  })

  it('stops a running recording the moment the shopper opts out', async () => {
    grantConsent()
    optInToReplay()
    const stopSessionRecording = vi.fn()
    parkedWindow.__ke_posthog = { capture: vi.fn(), stopSessionRecording }
    render(<PostHogReplay />)
    await settle()

    clearCookies()
    grantConsent() // Consent stays; only the replay opt-in was withdrawn.
    window.dispatchEvent(new Event(REPLAY_OPTIN_CHANGED_EVENT))

    await waitFor(() => expect(stopSessionRecording).toHaveBeenCalled())
  })

  it('never initialises a second client over a parked one', async () => {
    grantConsent()
    optInToReplay()
    parkedWindow.__ke_posthog = { capture: vi.fn() }
    render(<PostHogReplay />)
    await settle()
    expect(init).not.toHaveBeenCalled()
  })
})
