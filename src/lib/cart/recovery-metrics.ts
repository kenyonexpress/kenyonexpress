/**
 * Abandoned-cart recovery rate and ROI, in integer basis points.
 *
 * TWO REMINDERS, NOT THREE. The mailer sends at T+2h and T+24h. A third mail
 * at 72h would be a marketing message without a transactional trigger, which
 * section 30A of the Israeli spam law treats as a commercial send. The 72
 * hours on `v_abandoned_cart_recovery` are the ATTRIBUTION WINDOW (a purchase
 * counts as recovered only if it lands within 72h of a nudge), not a third
 * send.
 *
 * Pure: the view already aggregated the week. This only combines weeks and
 * refuses to invent a rate when nothing was sent.
 */

export interface RecoveryWeek {
  nudgesSent: number
  recovered: number
  recoveredValueAgorot: number
}

export interface RecoveryTotals {
  nudgesSent: number
  recovered: number
  recoveredValueAgorot: number
  /** Recovered / sent, in basis points. Null when nothing was sent. */
  recoveryRateBp: number | null
}

export function sumRecoveryWeeks(weeks: readonly RecoveryWeek[]): RecoveryTotals {
  const nudgesSent = weeks.reduce((sum, week) => sum + week.nudgesSent, 0)
  const recovered = weeks.reduce((sum, week) => sum + week.recovered, 0)
  const recoveredValueAgorot = weeks.reduce((sum, week) => sum + week.recoveredValueAgorot, 0)
  return {
    nudgesSent,
    recovered,
    recoveredValueAgorot,
    recoveryRateBp: nudgesSent <= 0 ? null : Math.floor((recovered * 10_000) / nudgesSent),
  }
}

/**
 * Recovered cart value over the cost of sending, in basis points.
 *
 * Cost is an input because the view does not know what a send costs. Zero or
 * negative cost is null rather than infinity.
 */
export function recoveryRoiBp(recoveredValueAgorot: number, costAgorot: number): number | null {
  if (costAgorot <= 0) return null
  return Math.floor((recoveredValueAgorot * 10_000) / costAgorot)
}
