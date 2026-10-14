import { termsAcceptanceRecord } from '@/server/auth/terms-record'
import { describe, expect, it } from 'vitest'
import { TERMS_ACCEPT_FIELD, termsAccepted } from './terms-acceptance'

describe('terms acceptance (UX24)', () => {
  it('reads the checkbox’s serialised forms and nothing else', () => {
    expect(termsAccepted('on')).toBe(true)
    expect(termsAccepted('1')).toBe(true)
    expect(termsAccepted('true')).toBe(true)
    expect(termsAccepted(null)).toBe(false)
    expect(termsAccepted(undefined)).toBe(false)
    expect(termsAccepted('')).toBe(false)
    expect(termsAccepted('off')).toBe(false)
    expect(TERMS_ACCEPT_FIELD).toBe('accept_terms')
  })

  it('records the moment and the versions of both documents in force', () => {
    const record = termsAcceptanceRecord(new Date('2026-10-15T08:00:00Z'))
    expect(record).toEqual({
      terms_accepted_at: '2026-10-15T08:00:00.000Z',
      terms_version: '1.1',
      privacy_version: '2.1',
    })
  })
})
