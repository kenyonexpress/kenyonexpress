import { describe, expect, it } from 'vitest'
import { EMPTY_INVENTORY, isCodeExpired, summarizeQrBatches } from './qr-batch-view'

const NOW = new Date('2026-09-17T10:00:00.000Z')
const PAST = '2026-09-01T00:00:00.000Z'
const FUTURE = '2026-10-01T00:00:00.000Z'

describe('isCodeExpired', () => {
  it('trusts the sweep stamp, then the per-code deadline, then says no', () => {
    expect(isCodeExpired({ expires_at: FUTURE, expired_at: PAST }, NOW)).toBe(true)
    expect(isCodeExpired({ expires_at: PAST, expired_at: null }, NOW)).toBe(true)
    expect(isCodeExpired({ expires_at: NOW.toISOString(), expired_at: null }, NOW)).toBe(true)
    expect(isCodeExpired({ expires_at: FUTURE, expired_at: null }, NOW)).toBe(false)
    expect(isCodeExpired({ expires_at: null, expired_at: null }, NOW)).toBe(false)
  })
})

describe('summarizeQrBatches', () => {
  it('counts redeemed, expired and available per batch from the code rows', () => {
    const rows = [
      { batch_id: 'a', expires_at: FUTURE, expired_at: null, redeemed_at: PAST },
      { batch_id: 'a', expires_at: FUTURE, expired_at: null, redeemed_at: null },
      { batch_id: 'a', expires_at: FUTURE, expired_at: null, redeemed_at: null },
      { batch_id: 'b', expires_at: PAST, expired_at: null, redeemed_at: null },
      { batch_id: 'b', expires_at: PAST, expired_at: PAST, redeemed_at: null },
      // Redeemed before its deadline passed: a spent code, not a dead one.
      { batch_id: 'b', expires_at: PAST, expired_at: null, redeemed_at: '2026-08-20T00:00:00Z' },
    ]
    const summary = summarizeQrBatches(rows, NOW)
    expect(summary.get('a')).toEqual({
      total: 3,
      redeemed: 1,
      expired: 0,
      available: 2,
      expires_at: FUTURE,
    })
    expect(summary.get('b')).toEqual({
      total: 3,
      redeemed: 1,
      expired: 2,
      available: 0,
      expires_at: PAST,
    })
  })

  it('shows an unswept but past deadline as expired, not available', () => {
    const summary = summarizeQrBatches(
      [{ batch_id: 'c', expires_at: PAST, expired_at: null, redeemed_at: null }],
      NOW,
    )
    expect(summary.get('c')).toMatchObject({ expired: 1, available: 0 })
  })

  it('reports the batch deadline only when every code shares it', () => {
    const mixed = summarizeQrBatches(
      [
        { batch_id: 'd', expires_at: FUTURE, expired_at: null, redeemed_at: null },
        { batch_id: 'd', expires_at: null, expired_at: null, redeemed_at: null },
      ],
      NOW,
    )
    expect(mixed.get('d')?.expires_at).toBeNull()
    const none = summarizeQrBatches(
      [{ batch_id: 'e', expires_at: null, expired_at: null, redeemed_at: null }],
      NOW,
    )
    expect(none.get('e')?.expires_at).toBeNull()
    expect(none.get('e')?.available).toBe(1)
  })

  it('answers an empty map for no rows, and the empty inventory is all zeros', () => {
    expect(summarizeQrBatches([], NOW).size).toBe(0)
    expect(EMPTY_INVENTORY).toEqual({
      total: 0,
      redeemed: 0,
      expired: 0,
      available: 0,
      expires_at: null,
    })
  })
})
