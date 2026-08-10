import { describe, expect, it } from 'vitest'
import {
  RETRYABLE_SCAN_OUTCOMES,
  SETTLED_SCAN_OUTCOMES,
  isSettledScanOutcome,
  settledKeys,
} from './offline-scan'

describe('isSettledScanOutcome', () => {
  it('settles every verdict the server actually reached', () => {
    for (const outcome of SETTLED_SCAN_OUTCOMES) {
      expect(isSettledScanOutcome(outcome), outcome).toBe(true)
    }
  })

  it('keeps only the outcomes where nothing was decided', () => {
    for (const outcome of RETRYABLE_SCAN_OUTCOMES) {
      expect(isSettledScanOutcome(outcome), outcome).toBe(false)
    }
  })

  it('settles an expired voucher rather than retrying it forever', () => {
    // The one a real till hits after an outage: a queued scan sits long enough
    // to cross the deadline. Retrying it produces a pending count that never
    // reaches zero and a cashier who stops trusting the number.
    expect(isSettledScanOutcome('expired')).toBe(true)
  })

  it('settles an unknown outcome rather than retrying it', () => {
    // A new outcome added server-side is still a decision. Defaulting the other
    // way would mean any future addition silently wedges every queue in the
    // field until the app is updated.
    expect(isSettledScanOutcome('some_future_outcome')).toBe(true)
  })
})

describe('settledKeys', () => {
  it('returns exactly the keys the device may drop', () => {
    expect(
      settledKeys([
        { idempotency_key: 'a', outcome: 'success' },
        { idempotency_key: 'b', outcome: 'error' },
        { idempotency_key: 'c', outcome: 'already_redeemed' },
        { idempotency_key: 'd', outcome: 'rate_limited' },
      ]),
    ).toEqual(['a', 'c'])
  })

  it('drops nothing from an empty drain', () => {
    expect(settledKeys([])).toEqual([])
  })
})
