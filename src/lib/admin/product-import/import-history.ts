import type { ImportMode } from './import-rows'

/**
 * The import history log, read back out of `audit_log`.
 *
 * WHY THE AUDIT LOG AND NOT A TABLE. A `product_import_runs` table would sit
 * in `migrations/pending/` unapplied (the rule: no migration reaches
 * production without a sign-off), and the history page would be empty on the
 * live site until someone applied it. `audit_log` is already the ledger every
 * admin mutation writes to, admins can already read it under RLS
 * (`audit_log_admin_select`, 011), and it carries two spare jsonb columns
 * (`before`, `after`) that nothing else uses for this entity. So a run is a
 * small sequence of audit rows sharing `entity_type = 'product_import_run'`
 * and `entity_id = <run id>`:
 *
 *   created        the run started (file name, mode, dry-run counts, columns)
 *   updated        one batch was applied; `before` holds that batch's
 *                  journal (inserted ids, and each updated row's prior
 *                  values for exactly the columns that changed)
 *   status_change  the run finished (done / partial / failed, counts, the
 *                  first ROW_ERROR_CAP row errors)
 *   restored       the run was rolled back (what was reverted, what was
 *                  skipped because someone edited it since, what failed)
 *
 * This module is the pure half: it folds those rows into one summary per run
 * and merges the batch journals so a whole run can be replayed backwards. The
 * database-touching half lives in `server/actions/admin/product-import.ts`.
 */

export const IMPORT_RUN_ENTITY = 'product_import_run'

/** Row errors kept on the finish event; the CSV report has the full list. */
export const ROW_ERROR_CAP = 200

export type ImportRunStatus = 'running' | 'done' | 'partial' | 'failed' | 'rolled_back'

export interface ImportRunJournal {
  inserts: string[]
  updates: { id: string; prior: Record<string, unknown> }[]
}

export interface ImportRunRowError {
  line: number
  slug: string | null
  name: string | null
  errors: string[]
}

export interface ImportRunRollbackSummary {
  revertedInserts: number
  revertedUpdates: number
  /** Rows left alone because the product was edited after the import. */
  skipped: number
  failures: number
  at: string
}

export interface ImportRunSummary {
  id: string
  startedAt: string
  /** The finish event's time, or the last batch's when the finish never came. */
  lastEventAt: string
  finishedAt: string | null
  actorId: string | null
  fileName: string
  mode: ImportMode
  /** Dry-run counts, as the admin saw them before pressing import. */
  totalRows: number
  validRows: number
  invalidRows: number
  batches: number
  inserted: number
  updated: number
  failed: number
  status: ImportRunStatus
  error: string | null
  rowErrors: ImportRunRowError[]
  rollback: ImportRunRollbackSummary | null
}

/** The subset of an `audit_log` row this module reads. */
export interface ImportRunEvent {
  entity_id: string
  action: string
  created_at: string
  actor_id: string | null
  changes: unknown
  before: unknown
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function num(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function str(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function parseRowErrors(value: unknown): ImportRunRowError[] {
  if (!Array.isArray(value)) return []
  const out: ImportRunRowError[] = []
  for (const item of value) {
    if (!isRecord(item)) continue
    const errors = Array.isArray(item.errors)
      ? item.errors.filter((e): e is string => typeof e === 'string')
      : []
    out.push({ line: num(item.line), slug: str(item.slug), name: str(item.name), errors })
  }
  return out
}

/** Reads one batch journal off an `updated` event's `before` column. */
export function parseJournal(value: unknown): ImportRunJournal {
  if (!isRecord(value)) return { inserts: [], updates: [] }
  const inserts = Array.isArray(value.inserts)
    ? value.inserts.filter((id): id is string => typeof id === 'string')
    : []
  const updates: ImportRunJournal['updates'] = []
  if (Array.isArray(value.updates)) {
    for (const u of value.updates) {
      if (isRecord(u) && typeof u.id === 'string' && isRecord(u.prior)) {
        updates.push({ id: u.id, prior: u.prior })
      }
    }
  }
  return { inserts, updates }
}

/**
 * Folds one run's events (any order) into a summary. Returns null when there
 * is no `created` event: a run whose start row never landed is unreadable,
 * and pretending otherwise would show a run with no file and no mode.
 */
export function summariseImportRun(events: ImportRunEvent[]): ImportRunSummary | null {
  const ordered = [...events].sort((a, b) => a.created_at.localeCompare(b.created_at))
  const start = ordered.find((e) => e.action === 'created')
  if (!start) return null
  const startChanges = isRecord(start.changes) ? start.changes : {}

  const summary: ImportRunSummary = {
    id: start.entity_id,
    startedAt: start.created_at,
    lastEventAt: start.created_at,
    finishedAt: null,
    actorId: start.actor_id,
    fileName: str(startChanges.file_name) ?? '',
    mode: startChanges.mode === 'upsert' ? 'upsert' : 'insert',
    totalRows: num(startChanges.total),
    validRows: num(startChanges.valid),
    invalidRows: num(startChanges.invalid),
    batches: 0,
    inserted: 0,
    updated: 0,
    failed: 0,
    status: 'running',
    error: null,
    rowErrors: [],
    rollback: null,
  }

  for (const event of ordered) {
    const changes = isRecord(event.changes) ? event.changes : {}
    switch (event.action) {
      case 'updated':
        summary.batches += 1
        summary.inserted += num(changes.inserted)
        summary.updated += num(changes.updated)
        summary.lastEventAt = event.created_at
        break
      case 'status_change': {
        const status = changes.status
        summary.status = status === 'partial' || status === 'failed' ? status : 'done'
        // The finish event carries the client's totals, which include batches
        // whose audit row may have been lost; trust it over the running sum.
        summary.inserted = num(changes.inserted)
        summary.updated = num(changes.updated)
        summary.failed = num(changes.failed)
        summary.error = str(changes.error)
        summary.rowErrors = parseRowErrors(changes.row_errors)
        summary.finishedAt = event.created_at
        summary.lastEventAt = event.created_at
        break
      }
      case 'restored':
        summary.status = 'rolled_back'
        summary.rollback = {
          revertedInserts: num(changes.reverted_inserts),
          revertedUpdates: num(changes.reverted_updates),
          skipped: num(changes.skipped),
          failures: num(changes.failures),
          at: event.created_at,
        }
        summary.lastEventAt = event.created_at
        break
      default:
        break
    }
  }
  return summary
}

/** Groups a flat page of audit rows into runs, newest first. */
export function groupImportRuns(events: ImportRunEvent[]): ImportRunSummary[] {
  const byRun = new Map<string, ImportRunEvent[]>()
  for (const event of events) {
    const list = byRun.get(event.entity_id)
    if (list) list.push(event)
    else byRun.set(event.entity_id, [event])
  }
  const runs: ImportRunSummary[] = []
  for (const list of byRun.values()) {
    const run = summariseImportRun(list)
    if (run) runs.push(run)
  }
  return runs.sort((a, b) => b.startedAt.localeCompare(a.startedAt))
}

/**
 * Every batch journal of a run, merged in batch order. Replaying it backwards
 * (`[...updates].reverse()`, then inserts) is the whole-run rollback.
 */
export function mergeRunJournal(events: ImportRunEvent[]): ImportRunJournal {
  const merged: ImportRunJournal = { inserts: [], updates: [] }
  const batches = events
    .filter((e) => e.action === 'updated')
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
  for (const batch of batches) {
    const journal = parseJournal(batch.before)
    merged.inserts.push(...journal.inserts)
    merged.updates.push(...journal.updates)
  }
  return merged
}

/** A run with no finish event that started this recently may still be going. */
export const RUNNING_GRACE_MS = 15 * 60 * 1000

export type RollbackRefusal = 'already_rolled_back' | 'maybe_running' | 'nothing_applied'

/** Why a run cannot be rolled back right now, or null when it can. */
export function rollbackRefusal(run: ImportRunSummary, now: number): RollbackRefusal | null {
  if (run.status === 'rolled_back') return 'already_rolled_back'
  if (run.status === 'running' && now - Date.parse(run.lastEventAt) < RUNNING_GRACE_MS) {
    return 'maybe_running'
  }
  if (run.batches === 0) return 'nothing_applied'
  return null
}

export const ROLLBACK_REFUSAL_MESSAGE: Record<RollbackRefusal, string> = {
  already_rolled_back: 'הריצה הזו כבר בוטלה',
  maybe_running: 'הריצה עדיין לא הסתיימה - אפשר לבטל אותה רק אחרי שתסתיים או אחרי 15 דקות',
  nothing_applied: 'בריצה הזו לא נשמרה אף שורה, אין מה לבטל',
}

export const IMPORT_RUN_STATUS_LABEL: Record<ImportRunStatus, string> = {
  running: 'בתהליך',
  done: 'הושלם',
  partial: 'הושלם חלקית',
  failed: 'נכשל',
  rolled_back: 'בוטל',
}
