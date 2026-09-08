import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  VoucherQrSecretMissingError,
  canVerifyVoucherQr,
  classifyVoucherQrPayload,
  signVoucherQrPayload,
  verifyVoucherQrPayload,
} from './qr'

const SECRET = 'test-secret-at-least-16-bytes-long-000'

function base(overrides: Record<string, unknown> = {}) {
  return {
    c: 'ABCDEFGHJK',
    s: 'supplier-1',
    u: 'user-1',
    e: 1_800_000_000,
    k: 'v1',
    ...overrides,
  }
}

describe('voucher QR sign/verify', () => {
  beforeEach(() => {
    process.env.VOUCHER_QR_SECRET = SECRET
    process.env.VOUCHER_QR_SECRET_PREVIOUS = undefined
  })
  afterEach(() => {
    process.env.VOUCHER_QR_SECRET = undefined
    process.env.VOUCHER_QR_SECRET_PREVIOUS = undefined
  })

  it('round-trips a signed payload', () => {
    const token = signVoucherQrPayload(base())
    expect(token.startsWith('KEV1.')).toBe(true)
    const parsed = verifyVoucherQrPayload(token)
    expect(parsed).not.toBeNull()
    expect(parsed?.c).toBe('ABCDEFGHJK')
    expect(parsed?.s).toBe('supplier-1')
    expect(parsed?.u).toBe('user-1')
    expect(parsed?.e).toBe(1_800_000_000)
    expect(parsed?.v).toBe(1)
  })

  it('rejects a payload signed with a different secret (forgery)', () => {
    const token = signVoucherQrPayload(base())
    process.env.VOUCHER_QR_SECRET = 'a-totally-different-secret-16bytes-xx'
    expect(verifyVoucherQrPayload(token)).toBeNull()
  })

  it('rejects a tampered body while the MAC stays the same', () => {
    const token = signVoucherQrPayload(base())
    const [prefix, , mac] = token.split('.')
    const forgedBody = Buffer.from(JSON.stringify(base({ s: 'supplier-2' }))).toString('base64url')
    expect(verifyVoucherQrPayload(`${prefix}.${forgedBody}.${mac}`)).toBeNull()
  })

  it('rejects a swapped version prefix (MAC covers the prefix)', () => {
    const token = signVoucherQrPayload(base())
    const [, body, mac] = token.split('.')
    expect(verifyVoucherQrPayload(`KEV2.${body}.${mac}`)).toBeNull()
  })

  it('rejects structurally malformed tokens without throwing', () => {
    expect(verifyVoucherQrPayload('')).toBeNull()
    expect(verifyVoucherQrPayload('KEV1.only-two')).toBeNull()
    expect(verifyVoucherQrPayload('a.b.c.d')).toBeNull()
    expect(verifyVoucherQrPayload(null as unknown as string)).toBeNull()
  })

  it('rejects a validly signed payload whose code is malformed', () => {
    const token = signVoucherQrPayload(base({ c: 'BAD' }))
    expect(verifyVoucherQrPayload(token)).toBeNull()
  })

  it('accepts the previous secret during rotation, primary still preferred', () => {
    const oldToken = signVoucherQrPayload(base())
    // rotate: previous becomes the old primary, primary becomes new
    process.env.VOUCHER_QR_SECRET = 'brand-new-primary-secret-16bytes-yyyy'
    process.env.VOUCHER_QR_SECRET_PREVIOUS = SECRET
    expect(verifyVoucherQrPayload(oldToken)).not.toBeNull()

    const newToken = signVoucherQrPayload(base())
    expect(verifyVoucherQrPayload(newToken)).not.toBeNull()
  })

  it('throws when no secret is configured (operator error, not attacker input)', () => {
    process.env.VOUCHER_QR_SECRET = undefined
    expect(() => signVoucherQrPayload(base())).toThrow(VoucherQrSecretMissingError)
    expect(() => verifyVoucherQrPayload('KEV1.x.y')).toThrow(VoucherQrSecretMissingError)
  })

  it('refuses a too-short secret', () => {
    process.env.VOUCHER_QR_SECRET = 'short'
    expect(() => signVoucherQrPayload(base())).toThrow(VoucherQrSecretMissingError)
  })
})

/**
 * The distinction that keeps a till's queue alive.
 *
 * `forged` is a permanent property of the token and the till deletes it.
 * `unverifiable` is a property of this server with no secret configured, and it
 * becomes valid again the moment an operator sets one. A classifier that folds
 * the second into the first discards paid-for redemptions.
 */
describe('classifyVoucherQrPayload', () => {
  beforeEach(() => {
    process.env.VOUCHER_QR_SECRET = SECRET
    process.env.VOUCHER_QR_SECRET_PREVIOUS = undefined
  })

  afterEach(() => {
    process.env.VOUCHER_QR_SECRET = SECRET
    process.env.VOUCHER_QR_SECRET_PREVIOUS = undefined
  })

  it('verifies a real token and hands back the payload', () => {
    const check = classifyVoucherQrPayload(signVoucherQrPayload(base()))
    expect(check.status).toBe('verified')
    expect(check.status === 'verified' && check.payload.c).toBe('ABCDEFGHJK')
  })

  it('calls a tampered token forged, not unverifiable', () => {
    expect(classifyVoucherQrPayload('KEV1.ZmFrZQ.bm90LWEtc2lnbmF0dXJl').status).toBe('forged')
  })

  // The exact token from the 28 Sentry events, which used to raise a 500.
  it('calls a well-formed token unverifiable when no secret is configured', () => {
    process.env.VOUCHER_QR_SECRET = undefined
    const check = classifyVoucherQrPayload('KEV1.ZmFrZQ.bm90LWEtc2lnbmF0dXJl')
    expect(check.status).toBe('unverifiable')
    expect(check.status === 'unverifiable' && check.error).toBeInstanceOf(
      VoucherQrSecretMissingError,
    )
  })

  it('never reports unverifiable as forged, on any input, when the secret is gone', () => {
    process.env.VOUCHER_QR_SECRET = undefined
    const real = 'KEV1.eyJ2IjoxfQ.c2ln'
    expect(classifyVoucherQrPayload(real).status).not.toBe('forged')
  })

  // A token of the wrong SHAPE is refused before the secret is read, so it is
  // forged even with no secret. Stated because it looks like an exception.
  it('still calls a malformed token forged with no secret, because no secret is read', () => {
    process.env.VOUCHER_QR_SECRET = undefined
    expect(classifyVoucherQrPayload('not-a-token').status).toBe('forged')
  })

  it('does not swallow an unrelated error', () => {
    expect(() => classifyVoucherQrPayload(null as unknown as string)).not.toThrow()
  })
})

describe('canVerifyVoucherQr', () => {
  it('is true with a configured secret', () => {
    process.env.VOUCHER_QR_SECRET = SECRET
    expect(canVerifyVoucherQr()).toBe(true)
  })

  it('is false with none, and false with one too short to be real', () => {
    process.env.VOUCHER_QR_SECRET = undefined
    expect(canVerifyVoucherQr()).toBe(false)
    process.env.VOUCHER_QR_SECRET = 'short'
    expect(canVerifyVoucherQr()).toBe(false)
    process.env.VOUCHER_QR_SECRET = SECRET
  })

  it('agrees with verify: whenever it is false, a real-looking token is unverifiable', () => {
    process.env.VOUCHER_QR_SECRET = undefined
    expect(canVerifyVoucherQr()).toBe(false)
    expect(classifyVoucherQrPayload('KEV1.ZmFrZQ.bm90LWEtc2lnbmF0dXJl').status).toBe('unverifiable')
    process.env.VOUCHER_QR_SECRET = SECRET
  })
})
