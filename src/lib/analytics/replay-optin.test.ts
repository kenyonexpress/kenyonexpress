/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CONSENT_WORDING_VERSION } from './consent'
import {
  REPLAY_OPTIN_CHANGED_EVENT,
  REPLAY_OPTIN_COOKIE,
  REPLAY_OPTIN_VALUE,
  isReplayAllowed,
  parseReplayOptIn,
  readReplayOptIn,
  writeReplayOptIn,
} from './replay-optin'

const CONSENT_OK = `granted.${CONSENT_WORDING_VERSION}`

function clearCookie(): void {
  document.cookie = `${REPLAY_OPTIN_COOKIE}=; expires=Thu, 01 Jan 1970 00:00:00 GMT`
}

afterEach(() => {
  clearCookie()
  vi.restoreAllMocks()
})

describe('parseReplayOptIn', () => {
  it('accepts exactly the serialized value and nothing lookalike', () => {
    expect(parseReplayOptIn(REPLAY_OPTIN_VALUE)).toBe(true)
    expect(parseReplayOptIn('true')).toBe(false)
    expect(parseReplayOptIn('0')).toBe(false)
    expect(parseReplayOptIn('')).toBe(false)
    expect(parseReplayOptIn(null)).toBe(false)
    expect(parseReplayOptIn(undefined)).toBe(false)
  })
})

describe('isReplayAllowed', () => {
  it('requires both gates, in every combination', () => {
    expect(isReplayAllowed(CONSENT_OK, REPLAY_OPTIN_VALUE)).toBe(true)
    // The banner alone is what the OLD behaviour was; it must no longer pass.
    expect(isReplayAllowed(CONSENT_OK, null)).toBe(false)
    expect(isReplayAllowed(null, REPLAY_OPTIN_VALUE)).toBe(false)
    expect(isReplayAllowed(`denied.${CONSENT_WORDING_VERSION}`, REPLAY_OPTIN_VALUE)).toBe(false)
    // Consent given against superseded wording does not carry the recorder.
    expect(isReplayAllowed('granted.1', REPLAY_OPTIN_VALUE)).toBe(false)
  })
})

describe('the cookie round trip', () => {
  it('writes, reads back, and announces the change', () => {
    const heard = vi.fn()
    window.addEventListener(REPLAY_OPTIN_CHANGED_EVENT, heard)

    expect(readReplayOptIn()).toBe(false)
    writeReplayOptIn(true)
    expect(readReplayOptIn()).toBe(true)
    writeReplayOptIn(false)
    expect(readReplayOptIn()).toBe(false)
    expect(heard).toHaveBeenCalledTimes(2)

    window.removeEventListener(REPLAY_OPTIN_CHANGED_EVENT, heard)
  })

  it('deletes on opt-out rather than storing a refusal', () => {
    writeReplayOptIn(true)
    writeReplayOptIn(false)
    expect(document.cookie.includes(REPLAY_OPTIN_COOKIE)).toBe(false)
  })
})
