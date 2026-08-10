/**
 * The rule that decides what a till may forget.
 *
 * An offline queue is only safe if both halves are right: the database
 * collapses replays (it does, via `voucher_redemptions.idempotency_key`), AND
 * the device stops re-sending things that will never change. This is the second
 * half, and it lives here rather than inline in the route so it can be stated
 * once and tested.
 *
 * THE ONLY RETRYABLE OUTCOME IS AN INFRASTRUCTURE FAILURE. Every other verdict
 * - redeemed, already redeemed, expired, cancelled, refunded, not found, bad
 * signature, wrong supplier - is a DECISION the server made and will make
 * identically on the next ask. Keeping one of those in the queue produces a
 * till that retries the same refusal forever and a pending count that never
 * reaches zero.
 *
 * The failure mode this prevents is not theoretical: `expired` is the outcome a
 * real till hits most often after an outage, because an outage is exactly when
 * a queued scan sits long enough to cross a deadline.
 */

/** The outcomes `redeem_voucher` and the scan log can return. */
export const SETTLED_SCAN_OUTCOMES = [
  'success',
  'already_redeemed',
  'expired',
  'cancelled',
  'refunded',
  'not_found',
  'wrong_supplier',
  'invalid_signature',
  'invalid_request',
  'unauthorized',
] as const

/**
 * `error` is written by the batch route when the RPC itself failed - a dropped
 * connection, a database that was restarting. `rate_limited` joins it: the
 * server did not decide anything about the voucher, it declined to look.
 */
export const RETRYABLE_SCAN_OUTCOMES = ['error', 'rate_limited'] as const

export function isSettledScanOutcome(outcome: string): boolean {
  return !(RETRYABLE_SCAN_OUTCOMES as readonly string[]).includes(outcome)
}

/** The keys a device may drop from its queue after a drain. */
export function settledKeys(
  results: readonly { idempotency_key: string; outcome: string }[],
): string[] {
  return results.filter((r) => isSettledScanOutcome(r.outcome)).map((r) => r.idempotency_key)
}
