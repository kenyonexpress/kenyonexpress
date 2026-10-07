import { afterEach, describe, expect, it } from 'vitest'
import {
  CONSENT_WORDING_VERSION,
  browserDoNotTrack,
  doNotTrackFromHeaders,
  isBehavioralTrackingAllowed,
  isDoNotTrackSignalled,
} from './consent'

/**
 * Do Not Track and Global Privacy Control are a standing opt-out the visitor
 * set before they ever saw the banner. The rule is one-directional: the
 * signal can only ever turn tracking OFF. These tests hold that line on the
 * pure matcher, the header matcher the server fan-out uses, and the combined
 * browser gate every client-side pipeline reads.
 */
describe('isDoNotTrackSignalled', () => {
  it('is off with no signal at all', () => {
    expect(isDoNotTrackSignalled({}, {})).toBe(false)
    expect(isDoNotTrackSignalled(null, null)).toBe(false)
    expect(isDoNotTrackSignalled({ doNotTrack: null }, { doNotTrack: null })).toBe(false)
  })

  it('reads the standard navigator.doNotTrack value', () => {
    expect(isDoNotTrackSignalled({ doNotTrack: '1' }, {})).toBe(true)
    // "0" is an explicit "track me"; "unspecified" is Firefox's old default.
    expect(isDoNotTrackSignalled({ doNotTrack: '0' }, {})).toBe(false)
    expect(isDoNotTrackSignalled({ doNotTrack: 'unspecified' }, {})).toBe(false)
  })

  it('reads the two legacy spellings', () => {
    expect(isDoNotTrackSignalled({}, { doNotTrack: '1' })).toBe(true)
    expect(isDoNotTrackSignalled({ msDoNotTrack: '1' }, {})).toBe(true)
    expect(isDoNotTrackSignalled({ doNotTrack: 'yes' }, {})).toBe(true)
  })

  it('treats Global Privacy Control as the same opt-out', () => {
    expect(isDoNotTrackSignalled({ globalPrivacyControl: true }, {})).toBe(true)
    expect(isDoNotTrackSignalled({ globalPrivacyControl: false }, {})).toBe(false)
  })
})

describe('doNotTrackFromHeaders', () => {
  const headers = (map: Record<string, string>) => (name: string) => map[name] ?? null

  it('honours Sec-GPC: 1 and DNT: 1', () => {
    expect(doNotTrackFromHeaders(headers({ 'sec-gpc': '1' }))).toBe(true)
    expect(doNotTrackFromHeaders(headers({ dnt: '1' }))).toBe(true)
    expect(doNotTrackFromHeaders(headers({ dnt: ' 1 ' }))).toBe(true)
  })

  it('is off for absent, zero, or unrelated values', () => {
    expect(doNotTrackFromHeaders(headers({}))).toBe(false)
    expect(doNotTrackFromHeaders(headers({ dnt: '0' }))).toBe(false)
    expect(doNotTrackFromHeaders(headers({ 'sec-gpc': '0' }))).toBe(false)
    expect(doNotTrackFromHeaders(() => undefined)).toBe(false)
  })
})

/** jsdom defines no navigator.doNotTrack at all, so it is defined rather than spied on. */
function setDoNotTrack(value: string | null | (() => string | null)): void {
  Object.defineProperty(navigator, 'doNotTrack', {
    configurable: true,
    get: typeof value === 'function' ? value : () => value,
  })
}

describe('the browser gate', () => {
  const granted = `granted.${CONSENT_WORDING_VERSION}`

  afterEach(() => {
    setDoNotTrack(null)
  })

  it('is open on consent when the browser sends no signal', () => {
    expect(browserDoNotTrack()).toBe(false)
    expect(isBehavioralTrackingAllowed(granted)).toBe(true)
  })

  it('closes on consent when navigator.doNotTrack is 1', () => {
    setDoNotTrack('1')
    expect(browserDoNotTrack()).toBe(true)
    expect(isBehavioralTrackingAllowed(granted)).toBe(false)
  })

  it('closes on consent when Global Privacy Control is on', () => {
    Object.defineProperty(navigator, 'globalPrivacyControl', {
      configurable: true,
      get: () => true,
    })
    try {
      expect(isBehavioralTrackingAllowed(granted)).toBe(false)
    } finally {
      Object.defineProperty(navigator, 'globalPrivacyControl', {
        configurable: true,
        get: () => undefined,
      })
    }
  })

  it('never opens a refusal, with or without the signal', () => {
    expect(isBehavioralTrackingAllowed(`denied.${CONSENT_WORDING_VERSION}`)).toBe(false)
    expect(isBehavioralTrackingAllowed(null)).toBe(false)
    setDoNotTrack('0')
    expect(isBehavioralTrackingAllowed(null)).toBe(false)
  })

  it('reads false, not a throw, when the navigator read itself fails', () => {
    setDoNotTrack(() => {
      throw new Error('locked down')
    })
    expect(browserDoNotTrack()).toBe(false)
  })
})
