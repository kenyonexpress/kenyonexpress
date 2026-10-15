import { agorot } from '@/lib/money'
import { describe, expect, it } from 'vitest'
import { cancellationFee, isWithinCancellationWindow } from './cancellation'

describe('cancellationFee', () => {
  it('charges 5% under the cap', () => {
    expect(cancellationFee(agorot(10_000))).toEqual({ feeAgorot: 500, refundAgorot: 9_500 })
  })
  it('caps the fee at 100 ILS', () => {
    expect(cancellationFee(agorot(500_000))).toEqual({ feeAgorot: 10_000, refundAgorot: 490_000 })
  })
  it('rounds half up in agorot', () => {
    expect(cancellationFee(agorot(10_010)).feeAgorot).toBe(501)
  })
  it('handles zero', () => {
    expect(cancellationFee(agorot(0))).toEqual({ feeAgorot: 0, refundAgorot: 0 })
  })
})

describe('isWithinCancellationWindow', () => {
  const issued = new Date('2026-10-01T00:00:00Z')
  it('is open on day 14 and closed after', () => {
    expect(isWithinCancellationWindow(issued, new Date('2026-10-15T00:00:00Z'))).toBe(true)
    expect(isWithinCancellationWindow(issued, new Date('2026-10-15T00:00:01Z'))).toBe(false)
  })
  it('rejects a future issue date', () => {
    expect(isWithinCancellationWindow(new Date('2026-10-20T00:00:00Z'), issued)).toBe(false)
  })
})
