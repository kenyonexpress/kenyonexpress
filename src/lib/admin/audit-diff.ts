/**
 * What actually changed in an `audit_log.changes` row.
 *
 * WHY THIS EXISTS. The trigger writes `{ old: <whole row>, new: <whole row> }`,
 * two full snapshots of about sixty columns each. Measured on production: an
 * entry whose only real change was `status: active -> draft` carries 120 fields,
 * 118 of them identical. The audit log page listed the action and the entity and
 * showed none of it, so "what did this person actually change" was a question
 * nobody could answer from the audit log, which is the one thing an audit log is
 * for.
 *
 * This is a pure function over the JSON. It does no I/O and knows nothing about
 * React, so it can be tested against real production payloads.
 */

/** One field that differs between the two snapshots. */
export type AuditFieldChange = {
  field: string
  before: unknown
  after: unknown
  kind: 'added' | 'removed' | 'changed'
}

export type AuditDiff = {
  /** 'create' and 'delete' carry only one side. */
  shape: 'create' | 'update' | 'delete' | 'unknown'
  changes: AuditFieldChange[]
  /** Fields that differ but are excluded as bookkeeping. Counted, not listed. */
  suppressed: number
}

/**
 * Columns that change on every write and tell a reader nothing.
 *
 * `updated_at` is the whole reason this list exists: it differs in literally
 * every `updated` row, so leaving it in means every diff has a noise line and
 * a diff with exactly one real change looks like two.
 */
const BOOKKEEPING = new Set(['updated_at', 'search_vector', 'tsv'])

/** Structural equality good enough for JSON: no dates, no functions, no cycles. */
function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (a === null || b === null || a === undefined || b === undefined) return false
  if (typeof a !== 'object' || typeof b !== 'object') return false
  return JSON.stringify(a) === JSON.stringify(b)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Reduce a `changes` payload to the fields that moved.
 *
 * Returns `shape: 'unknown'` rather than throwing on a payload that is not
 * `{old, new}`: an audit row written by some future trigger with a different
 * shape must not break the page that lists every other row.
 */
export function diffAuditChanges(changes: unknown): AuditDiff {
  if (!isRecord(changes)) return { shape: 'unknown', changes: [], suppressed: 0 }

  const before = isRecord(changes.old) ? changes.old : null
  const after = isRecord(changes.new) ? changes.new : null

  if (!before && !after) return { shape: 'unknown', changes: [], suppressed: 0 }

  const shape: AuditDiff['shape'] = !before ? 'create' : !after ? 'delete' : 'update'

  const fields = [...new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])].sort()

  const out: AuditFieldChange[] = []
  let suppressed = 0

  for (const field of fields) {
    const a = before?.[field]
    const b = after?.[field]
    if (sameValue(a, b)) continue

    if (BOOKKEEPING.has(field)) {
      suppressed += 1
      continue
    }

    const kind: AuditFieldChange['kind'] =
      a === undefined || a === null
        ? 'added'
        : b === undefined || b === null
          ? 'removed'
          : 'changed'

    out.push({ field, before: a, after: b, kind })
  }

  return { shape, changes: out, suppressed }
}

/**
 * A short human summary, for a table cell that has one line to work with.
 *
 * Deliberately names the fields rather than counting them. "3 fields changed"
 * sends the reader to open the row; "status, price_ils, +1 more" often does not.
 */
export function summariseAuditDiff(diff: AuditDiff, limit = 3): string {
  if (diff.shape === 'unknown') return 'לא ניתן לפענוח'
  if (diff.changes.length === 0) {
    return diff.suppressed > 0 ? 'ללא שינוי מהותי' : 'ללא שינוי'
  }
  const names = diff.changes.slice(0, limit).map((c) => c.field)
  const rest = diff.changes.length - names.length
  return rest > 0 ? `${names.join(', ')}, ועוד ${rest}` : names.join(', ')
}
