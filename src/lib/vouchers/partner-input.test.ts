import { describe, expect, it } from 'vitest'
import { parsePartnerInput } from './partner-input'

describe('parsePartnerInput (S15)', () => {
  it('reads exactly 8 digits as the partner pin, spaces and hyphens ignored', () => {
    expect(parsePartnerInput('12345678')).toEqual({ kind: 'pin', pin: '12345678' })
    expect(parsePartnerInput(' 1234-5678 ')).toEqual({ kind: 'pin', pin: '12345678' })
    expect(parsePartnerInput('1234 5678')).toEqual({ kind: 'pin', pin: '12345678' })
  })

  it('refuses 7 or 9 digits rather than guessing', () => {
    expect(parsePartnerInput('1234567')).toEqual({ kind: 'invalid' })
    expect(parsePartnerInput('123456789')).toEqual({ kind: 'invalid' })
  })

  it('keeps the 10-symbol short code, which cannot collide with a pin', () => {
    expect(parsePartnerInput('abcde-fghjk')).toEqual({ kind: 'code', code: 'ABCDEFGHJK' })
    expect(parsePartnerInput('1234567890')).toEqual({ kind: 'code', code: '1234567890' })
  })

  it('takes a signed token whole, bare or inside a redeem URL', () => {
    expect(parsePartnerInput('KEV1.body.mac')).toEqual({ kind: 'token', token: 'KEV1.body.mac' })
    expect(parsePartnerInput('https://kenyonexpress.co.il/redeem/KEV1.body.mac')).toEqual({
      kind: 'token',
      token: 'KEV1.body.mac',
    })
  })

  it('refuses empty and garbage', () => {
    expect(parsePartnerInput('')).toEqual({ kind: 'invalid' })
    expect(parsePartnerInput('hello')).toEqual({ kind: 'invalid' })
  })
})
