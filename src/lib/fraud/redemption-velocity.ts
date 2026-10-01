/**
 * Velocity signals for voucher redemption abuse. Monitoring only, and that is
 * deliberate, not a missing escalation.
 *
 * WHY THIS NEVER REFUSES. `redeem_voucher` (085) already has the refusing
 * layer that matters for a single scan: the atomic UPDATE is the duplicate
 * guard, and `check_user_rate_limit` bounds one account to 30 scans a minute
 * regardless of which address they come from. What that pair cannot see is
 * SHAPE across scans - one address operating several supplier logins, or one
 * account racking up refusals far faster than a till that is actually serving
 * customers would. Those are exactly the signals this module counts.
 *
 * It still may not decide anything, for the same reason `scan-context.ts`
 * never lets an authorization decision read the IP it records:
 * `X-Forwarded-For` is a client-appendable header, and whether Vercel
 * overwrites it in front of this app is an open, unverified question (see
 * `docs/QUESTIONS-FOR-OFIR.md` #14). A hard limit keyed on an unverified
 * address can be defeated by an attacker who rotates it, and can be turned
 * into a weapon by an attacker who sets it to a real till's address. Blocking
 * a redemption the RPC already approved, on a signal this shaky, would cost a
 * real customer's coupon to prevent an abuse this shop has never measured -
 * the same trade `risk-score.ts` already refuses to make for checkout.
 *
 * So this is `risk-score.ts`'s half of the fraud layer, applied to
 * redemption, not `velocity.ts`'s: it ROUTES attention (here, into the logs
 * `docs/ARCHITECTURE-OPS.md` says Sentry already carries broadly), and
 * `ARCHITECTURE-OPS.md` keeps paging at five alerts and says plainly that "a
 * rate limit catch is itself a success" - not a sixth alert. Nothing here
 * calls `sendAlert`.
 */

export type RedemptionVelocityCounts = {
  /** Distinct scanning accounts seen from this address in the last hour, this scan's account included. 0 when there is no address to key on. */
  accountsFromIpLastHour: number
  /** Redemption attempts of any outcome from this address in the last hour. 0 when there is no address to key on. */
  attemptsFromIpLastHour: number
  /** This account's own non-success outcomes in the last hour. */
  failedOutcomesLastHour: number
}

export type RedemptionVelocityFlag =
  | 'ip_shared_across_accounts'
  | 'ip_burst'
  | 'account_high_failure_rate'

export const REDEMPTION_VELOCITY_LIMITS = {
  /**
   * Three or more different supplier logins scanning from one address inside
   * an hour. A business with several tills shares a till's own network, not
   * three separate staff *logins*; three is a shape no ordinary shift has.
   */
  accountsFromIpLastHour: 3,
  /**
   * Sixty attempts from one address in an hour is one every minute, without
   * pause, for an hour - above what the busiest real counter does, and well
   * below what the per-account ceiling (30/minute = up to 1,800/hour) alone
   * would catch if that account's traffic were spread over several addresses.
   */
  attemptsFromIpLastHour: 60,
  /**
   * Twenty non-success outcomes from one account in an hour. A till that
   * mis-scans occasionally still succeeds most of the time; a run of twenty
   * refusals is the shape of someone trying codes rather than serving
   * customers.
   */
  failedOutcomesLastHour: 20,
} as const

/**
 * Pure. Every flag that fires, not just the first: unlike `checkVelocity`
 * this never turns an answer into a refusal, so there is no "the customer is
 * told one reason" ordering to preserve.
 */
export function checkRedemptionVelocity(
  counts: RedemptionVelocityCounts,
): RedemptionVelocityFlag[] {
  const flags: RedemptionVelocityFlag[] = []
  if (counts.accountsFromIpLastHour >= REDEMPTION_VELOCITY_LIMITS.accountsFromIpLastHour) {
    flags.push('ip_shared_across_accounts')
  }
  if (counts.attemptsFromIpLastHour >= REDEMPTION_VELOCITY_LIMITS.attemptsFromIpLastHour) {
    flags.push('ip_burst')
  }
  if (counts.failedOutcomesLastHour >= REDEMPTION_VELOCITY_LIMITS.failedOutcomesLastHour) {
    flags.push('account_high_failure_rate')
  }
  return flags
}
