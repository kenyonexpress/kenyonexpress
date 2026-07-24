import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { VoucherQrSecretMissingError, signVoucherQrPayload, verifyVoucherQrPayload } from './qr'

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
    // biome-ignore lint/suspicious/noExplicitAny: exercising a bad input
    expect(verifyVoucherQrPayload(null as any)).toBeNull()
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
