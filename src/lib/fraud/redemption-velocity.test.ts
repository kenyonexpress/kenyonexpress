import {
  REDEMPTION_VELOCITY_LIMITS,
  checkRedemptionVelocity,
} from '@/lib/fraud/redemption-velocity'
import { describe, expect, it } from 'vitest'

const clean = {
  accountsFromIpLastHour: 1,
  attemptsFromIpLastHour: 1,
  failedOutcomesLastHour: 0,
}

describe('checkRedemptionVelocity', () => {
  it('flags nothing for an ordinary till', () => {
    expect(checkRedemptionVelocity(clean)).toEqual([])
  })

  it('flags nothing for a shift with two staff logins and a few mis-scans', () => {
    // The false positive that would matter: a real business, a slow network
    // day. Every ceiling sits above this on purpose.
    expect(
      checkRedemptionVelocity({
        accountsFromIpLastHour: 2,
        attemptsFromIpLastHour: 40,
        failedOutcomesLastHour: 5,
      }),
    ).toEqual([])
  })

  it('flags ip_shared_across_accounts at the ceiling, not one below it', () => {
    const below = REDEMPTION_VELOCITY_LIMITS.accountsFromIpLastHour - 1
    expect(checkRedemptionVelocity({ ...clean, accountsFromIpLastHour: below })).toEqual([])
    expect(
      checkRedemptionVelocity({
        ...clean,
        accountsFromIpLastHour: REDEMPTION_VELOCITY_LIMITS.accountsFromIpLastHour,
      }),
    ).toEqual(['ip_shared_across_accounts'])
  })

  it('flags ip_burst at the ceiling', () => {
    expect(
      checkRedemptionVelocity({
        ...clean,
        attemptsFromIpLastHour: REDEMPTION_VELOCITY_LIMITS.attemptsFromIpLastHour,
      }),
    ).toEqual(['ip_burst'])
  })

  it('flags account_high_failure_rate at the ceiling', () => {
    expect(
      checkRedemptionVelocity({
        ...clean,
        failedOutcomesLastHour: REDEMPTION_VELOCITY_LIMITS.failedOutcomesLastHour,
      }),
    ).toEqual(['account_high_failure_rate'])
  })

  it('reports every flag that fires, not just the first', () => {
    const result = checkRedemptionVelocity({
      accountsFromIpLastHour: REDEMPTION_VELOCITY_LIMITS.accountsFromIpLastHour,
      attemptsFromIpLastHour: REDEMPTION_VELOCITY_LIMITS.attemptsFromIpLastHour,
      failedOutcomesLastHour: REDEMPTION_VELOCITY_LIMITS.failedOutcomesLastHour,
    })
    expect(result).toEqual(
      expect.arrayContaining([
        'ip_shared_across_accounts',
        'ip_burst',
        'account_high_failure_rate',
      ]),
    )
    expect(result).toHaveLength(3)
  })
})
