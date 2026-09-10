import { beforeEach, describe, expect, it } from 'vitest'
import {
  __resetRejectionMemory,
  identifierFingerprint,
  policyFromKey,
  shouldReportRejection,
} from './rejections'

const NOW = 1_800_000_000_000

beforeEach(() => {
  __resetRejectionMemory()
})

describe('what a refusal is allowed to say out loud', () => {
  it('reads the policy name out of either key shape', () => {
    // The Redis key carries the namespace, the Postgres key does not, and both
    // reach the reporter - one per backend.
    expect(policyFromKey('rl:v1:phone-otp:1.2.3.4')).toBe('phone-otp')
    expect(policyFromKey('phone-otp:1.2.3.4')).toBe('phone-otp')
    expect(policyFromKey('')).toBeNull()
  })

  it('never lets the identifier through in the clear', () => {
    // `phone-otp-number` is keyed on the phone number a customer typed. The
    // scrubber works on field names, so this is the only thing stopping it.
    const key = 'rl:v1:phone-otp-number:0501234567'
    const fingerprint = identifierFingerprint(key)

    expect(fingerprint).toMatch(/^[0-9a-f]{12}$/)
    expect(fingerprint).not.toContain('0501234567')
    expect(key).toContain('0501234567') // the input really did carry it
  })

  it('gives the same identifier the same fingerprint from either key shape', () => {
    expect(identifierFingerprint('rl:v1:login-account:a@b.test')).toBe(
      identifierFingerprint('login-account:a@b.test'),
    )
  })

  it('separates two identifiers under the same policy', () => {
    expect(identifierFingerprint('rl:v1:phone-otp:1.2.3.4')).not.toBe(
      identifierFingerprint('rl:v1:phone-otp:5.6.7.8'),
    )
  })
})

describe('one line per key per window', () => {
  it('reports the first refusal and not the rest of that window', () => {
    const key = 'rl:v1:begin_checkout:user:abc'
    const resetAt = NOW + 60_000

    expect(shouldReportRejection(key, resetAt, 60, NOW)).toBe(true)
    for (let i = 0; i < 50; i++) {
      expect(shouldReportRejection(key, resetAt, 60, NOW + i)).toBe(false)
    }
  })

  it('reports again in the next window, because that is a new fact', () => {
    const key = 'rl:v1:begin_checkout:user:abc'
    expect(shouldReportRejection(key, NOW + 60_000, 60, NOW)).toBe(true)
    expect(shouldReportRejection(key, NOW + 120_000, 60, NOW + 60_001)).toBe(true)
  })

  it('still bounds the Postgres path, which reports no reset time at all', () => {
    // The fallback RPC answers one boolean, so the window is bucketed off the
    // clock instead. Coarser, still one line per key per window rather than one
    // per request.
    const key = 'begin_checkout:user:abc'
    expect(shouldReportRejection(key, null, 60, NOW)).toBe(true)
    expect(shouldReportRejection(key, null, 60, NOW + 1_000)).toBe(false)
    expect(shouldReportRejection(key, null, 60, NOW + 61_000)).toBe(true)
  })

  it('keeps two keys apart', () => {
    expect(shouldReportRejection('rl:v1:phone-otp:1.1.1.1', NOW + 1000, 1, NOW)).toBe(true)
    expect(shouldReportRejection('rl:v1:phone-otp:2.2.2.2', NOW + 1000, 1, NOW)).toBe(true)
  })

  it('does not grow without bound, and forgets the oldest first', () => {
    for (let i = 0; i < 600; i++) {
      shouldReportRejection(`rl:v1:phone-otp:${i}`, NOW + 1000, 1, NOW)
    }
    // The earliest key was evicted, so it reports again; the newest has not been.
    expect(shouldReportRejection('rl:v1:phone-otp:0', NOW + 1000, 1, NOW)).toBe(true)
    expect(shouldReportRejection('rl:v1:phone-otp:599', NOW + 1000, 1, NOW)).toBe(false)
  })
})
