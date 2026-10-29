import { describe, expect, it } from 'vitest'
import { isTransferable, normaliseTransferEmail } from './transfer'

describe('normaliseTransferEmail', () => {
  it('trims and lowercases', () => {
    expect(normaliseTransferEmail('  A@B.co ')).toBe('a@b.co')
  })
  it('rejects malformed input', () => {
    expect(normaliseTransferEmail('nope')).toBeNull()
    expect(normaliseTransferEmail('a b@c.d')).toBeNull()
  })
})

describe('isTransferable', () => {
  const now = new Date('2026-10-30T00:00:00Z')
  it('allows an issued, unexpired coupon', () => {
    expect(isTransferable({ status: 'issued', expires_at: '2026-11-01T00:00:00Z' }, now)).toBe(true)
  })
  it('refuses redeemed, expired or unparseable', () => {
    expect(isTransferable({ status: 'redeemed', expires_at: '2026-11-01T00:00:00Z' }, now)).toBe(
      false,
    )
    expect(isTransferable({ status: 'issued', expires_at: '2026-10-01T00:00:00Z' }, now)).toBe(
      false,
    )
    expect(isTransferable({ status: 'issued', expires_at: 'x' }, now)).toBe(false)
  })
})
