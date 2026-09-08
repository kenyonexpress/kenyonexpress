/**
 * The legal status moves, as the DATABASE enforces them.
 *
 * This is not a second copy of `src/server/domain/orders/state-machine.ts` and
 * it is deliberately larger than it. That module says what NEW code may write
 * under the no-escrow rule; it does not admit `escrow_held`, `escrow_released`
 * or `platform_settled` at all, because no new row should enter them.
 *
 * `migrations/applied/137_order_transition_guard.sql` has a different job. (It
 * was `pending/` when this was written; it applied on 2026-09-03.) It runs
 * against rows written years ago under rules that no longer apply, and two
 * `order_items` rows sit in `escrow_held` in production right now. A guard that
 * refuses to let a legacy row move does not enforce the rule, it strands the
 * row. So this table is the superset: everything the code can actually produce,
 * including the legacy paths.
 *
 * It is generated from the same source as the SQL, and
 * `status-transitions.test.ts` parses the migration and fails if the two ever
 * disagree. That is the only thing keeping a hand-edit to either side from
 * silently splitting them.
 *
 * FOUR COLUMNS, NOT THREE. `vouchers.status` was guarded in production by
 * `166_voucher_transition_guard.sql` on 2026-09-03 and was missing from this
 * table until 2026-09-09, so for six days the fourth live guard was the one
 * thing here with no mirror and no drift test. The gate that exists for the
 * other three is the entire reason 137 did not ship a guard that raised 23514
 * on every voucher scan; leaving a guard outside it is the same bet again.
 *
 * The voucher machine is ALSO expressed in
 * `src/server/domain/vouchers/state-machine.ts`, which is the richer of the two
 * because it carries the WRONG_SUPPLIER / PAST_EXPIRY guards that a status pair
 * cannot express. That module says which moves the application may attempt;
 * this one says which pairs the database will accept. `state-machine.test.ts`
 * now checks them against each other.
 */
import table from './status-transitions.json'

export type GuardedColumn =
  | 'orders.status'
  | 'order_items.settlement_status'
  | 'payments.status'
  | 'vouchers.status'

export const STATUS_TRANSITIONS: Readonly<
  Record<GuardedColumn, Readonly<Record<string, readonly string[]>>>
> = table as Record<GuardedColumn, Record<string, string[]>>

export const GUARDED_COLUMNS: readonly GuardedColumn[] = [
  'orders.status',
  'order_items.settlement_status',
  'payments.status',
  'vouchers.status',
]

/**
 * Does the guard permit this move?
 *
 * A move to the same state is always legal: an `UPDATE` that touches some other
 * column leaves the status equal to itself, and rejecting that would fail every
 * unrelated write to the table.
 */
export function isLegalTransition(column: GuardedColumn, from: string, to: string): boolean {
  if (from === to) return true
  return (STATUS_TRANSITIONS[column][from] ?? []).includes(to)
}

/** Every state named on either side of a rule, plus every terminal state. */
export function statesOf(column: GuardedColumn): readonly string[] {
  return Object.keys(STATUS_TRANSITIONS[column]).sort()
}

/** States no rule leaves. */
export function terminalStatesOf(column: GuardedColumn): readonly string[] {
  return statesOf(column).filter((s) => (STATUS_TRANSITIONS[column][s] ?? []).length === 0)
}
