import { describe, expect, it } from 'vitest'
import { recoveryRoiBp, sumRecoveryWeeks } from './recovery-metrics'

describe('sumRecoveryWeeks', () => {
  it('returns a null rate when nothing was sent', () => {
    expect(sumRecoveryWeeks([])).toEqual({
      nudgesSent: 0,
      recovered: 0,
      recoveredValueAgorot: 0,
      recoveryRateBp: null,
    })
  })

  it('reports recovery in integer basis points', () => {
    const totals = sumRecoveryWeeks([
      { nudgesSent: 10, recovered: 2, recoveredValueAgorot: 50_000 },
      { nudgesSent: 10, recovered: 1, recoveredValueAgorot: 10_000 },
    ])
    expect(totals).toEqual({
      nudgesSent: 20,
      recovered: 3,
      recoveredValueAgorot: 60_000,
      recoveryRateBp: 1500,
    })
  })
})

describe('recoveryRoiBp', () => {
  it('is null when cost is zero', () => {
    expect(recoveryRoiBp(10_000, 0)).toBeNull()
  })

  it('is recovered value over cost in basis points', () => {
    expect(recoveryRoiBp(50_000, 10_000)).toBe(50_000)
  })
})
