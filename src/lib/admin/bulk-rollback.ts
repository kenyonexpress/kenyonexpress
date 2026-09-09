/**
 * Undoing the last bulk operation, decided here so it can be tested without a
 * database.
 *
 * =========================================================================
 * WHY THIS COULD NOT BE BUILT BEFORE
 * =========================================================================
 *
 * The bulk actions recorded `changes: { ids, status }` -- the NEW state and
 * nothing else. From that, an undo is not merely hard, it is impossible:
 *
 *   - a percentage adjustment is not exactly invertible (2 divisions of a
 *     rounded number do not return the original agorot), and
 *   - in `set` mode the old prices are simply gone.
 *
 * One of them additionally wrote a SECOND audit row shaped
 * `{ old: { ids }, new: {...} }`, whose `old` contained no old values at all --
 * so every bulk assign and every bulk price change produced two rows that read
 * as two separate operations, and the one that claimed to hold the old state
 * held a list of ids.
 *
 * `audit_log` has carried `before` and `after` jsonb columns since 169 (checked
 * against production 2026-09-10) and `writeAuditLog` never wrote either. So the
 * fix needed no migration: snapshot the rows first, write ONE row, and restore
 * from it.
 *
 * =========================================================================
 * THE SAFETY RULE, WHICH IS THE WHOLE DESIGN
 * =========================================================================
 *
 * An undo must never revert an edit that happened AFTER the operation it is
 * undoing. Someone bulk-adjusts 40 prices, an operator then fixes one product
 * by hand, and an hour later somebody clicks undo: reverting all 40 would throw
 * away the hand fix silently, and the person who made it would have no way to
 * know.
 *
 * So a row is restored only when its current value still equals what the bulk
 * operation left there. Anything else is SKIPPED AND NAMED, never restored and
 * never quietly dropped. That makes undo partial by design, and a partial undo
 * that says which rows it did not touch is worth more than a complete one that
 * cannot be trusted.
 */

/** The bulk operations that record enough to be undone. */
export type BulkOperationKind = 'assign_category' | 'adjust_prices' | 'update_status'

export const BULK_OPERATION_LABELS: Record<BulkOperationKind, string> = {
  assign_category: 'שיוך קטגוריה',
  adjust_prices: 'עדכון מחירים',
  update_status: 'שינוי סטטוס',
}

/** A product row reduced to the columns one bulk operation touches. */
export type BulkSnapshotRow = { id: string } & Record<string, string | number | null | undefined>

export type RollbackSkip = {
  id: string
  reason: 'missing' | 'changed_since'
}

export interface RollbackPlan {
  /** Patches to apply, one per product. Always includes `id`. */
  restore: BulkSnapshotRow[]
  skipped: RollbackSkip[]
}

/** The columns a snapshot row carries, other than the id. */
function auditedColumns(row: BulkSnapshotRow): string[] {
  return Object.keys(row).filter((key) => key !== 'id')
}

/**
 * `null` and `undefined` are the same absence here.
 *
 * A snapshot round-trips through JSONB, and `JSON.stringify` drops an
 * `undefined` value entirely while Postgres returns the column as `null`. Left
 * strict, every product whose `category_id` was empty would compare unequal to
 * itself and be skipped as "changed since" -- which is the single most common
 * row in a bulk category assignment.
 */
function sameValue(a: unknown, b: unknown): boolean {
  if (a === null || a === undefined) return b === null || b === undefined
  return a === b
}

/**
 * What an undo would do, given the snapshot and the rows as they are now.
 *
 * `current` may be shorter than `before`: a product deleted since the operation
 * is skipped as `missing` rather than resurrected.
 */
export function planRollback(
  before: ReadonlyArray<BulkSnapshotRow>,
  after: ReadonlyArray<BulkSnapshotRow>,
  current: ReadonlyArray<BulkSnapshotRow>,
): RollbackPlan {
  const afterById = new Map(after.map((row) => [row.id, row]))
  const currentById = new Map(current.map((row) => [row.id, row]))

  const restore: BulkSnapshotRow[] = []
  const skipped: RollbackSkip[] = []

  for (const beforeRow of before) {
    const nowRow = currentById.get(beforeRow.id)
    if (!nowRow) {
      skipped.push({ id: beforeRow.id, reason: 'missing' })
      continue
    }

    // No `after` entry means the operation skipped this product (a price it
    // refused to scale, for instance). There is nothing to undo, and it is not
    // a conflict either, so it is neither restored nor reported.
    const afterRow = afterById.get(beforeRow.id)
    if (!afterRow) continue

    const columns = auditedColumns(afterRow)
    const untouched = columns.every((column) => sameValue(nowRow[column], afterRow[column]))
    if (!untouched) {
      skipped.push({ id: beforeRow.id, reason: 'changed_since' })
      continue
    }

    const patch: BulkSnapshotRow = { id: beforeRow.id }
    for (const column of columns) {
      patch[column] = beforeRow[column] ?? null
    }
    restore.push(patch)
  }

  return { restore, skipped }
}

/** Hebrew for what an undo did, said in one line. */
export function describeRollback(plan: RollbackPlan): string {
  if (plan.restore.length === 0 && plan.skipped.length === 0) {
    return 'לא היה מה לשחזר.'
  }

  const parts = [`שוחזרו ${plan.restore.length} מוצרים`]
  const changed = plan.skipped.filter((s) => s.reason === 'changed_since').length
  const missing = plan.skipped.filter((s) => s.reason === 'missing').length
  if (changed > 0) parts.push(`${changed} דולגו כי הם שונו מאז`)
  if (missing > 0) parts.push(`${missing} כבר לא קיימים`)
  return `${parts.join(', ')}.`
}
