import { describe, expect, it } from 'vitest'
import {
  APP_CONSENT_CHANNELS,
  APP_CONSENT_WORDING_VERSION,
  appConsentIsOn,
  appConsentPreferenceRows,
} from './app-consent'
import { OPTIONAL_KINDS, REQUIRED_KINDS } from './preferences'

describe('everything in the app', () => {
  it('covers every optional kind on exactly the two in-app channels', () => {
    const rows = appConsentPreferenceRows('u1', true)
    expect(rows).toHaveLength(OPTIONAL_KINDS.length * APP_CONSENT_CHANNELS.length)
    expect(new Set(rows.map((r) => r.channel))).toEqual(new Set(['in_app', 'push']))
    expect(rows.every((r) => r.enabled && r.user_id === 'u1')).toBe(true)
  })

  it('never writes email, whatsapp or a required kind', () => {
    const rows = appConsentPreferenceRows('u1', true)
    expect(rows.some((r) => (r.channel as string) === 'email')).toBe(false)
    expect(rows.some((r) => (r.channel as string) === 'whatsapp')).toBe(false)
    for (const kind of REQUIRED_KINDS) {
      expect(rows.some((r) => (r.kind as string) === kind)).toBe(false)
    }
  })

  it('writes the same rows switched off for an opt-out', () => {
    const off = appConsentPreferenceRows('u1', false)
    expect(off.every((r) => r.enabled === false)).toBe(true)
    expect(off).toHaveLength(appConsentPreferenceRows('u1', true).length)
  })

  it('reads the switch from the newest consent event', () => {
    expect(appConsentIsOn([])).toBe(false)
    expect(
      appConsentIsOn([
        { action: 'opt_in', created_at: '2026-09-01T00:00:00Z' },
        { action: 'opt_out', created_at: '2026-09-02T00:00:00Z' },
      ]),
    ).toBe(false)
    expect(
      appConsentIsOn([
        { action: 'opt_out', created_at: '2026-09-01T00:00:00Z' },
        { action: 'opt_in', created_at: '2026-09-03T00:00:00Z' },
      ]),
    ).toBe(true)
  })

  it('carries a wording version so a consent stays attributable', () => {
    expect(APP_CONSENT_WORDING_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})
