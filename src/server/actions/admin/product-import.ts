'use server'

import { writeAuditLog } from '@/lib/admin/audit'
import {
  IMPORT_RUN_ENTITY,
  type ImportRunJournal,
  type ImportRunRowError,
  type ImportRunStatus,
  ROLLBACK_REFUSAL_MESSAGE,
  ROW_ERROR_CAP,
  mergeRunJournal,
  rollbackRefusal,
  summariseImportRun,
} from '@/lib/admin/product-import/import-history'
import {
  type ImportMode,
  type RawImportRow,
  type ValidatedImportRow,
  buildUpsertUpdateFields,
  markInFileDuplicates,
  validateImportRow,
} from '@/lib/admin/product-import/import-rows'
import { requireAdminSession } from '@/lib/admin/rbac'
import { CATALOGUE_TAG } from '@/lib/catalogue-cache'
import { withActionContext } from '@/lib/observability/action-context'
import { excludeDeleted } from '@/lib/soft-delete'
import { createClient } from '@/lib/supabase/server'
import { loadImportRunEvents } from '@/server/queries/product-import-history'
import type { Json, TablesUpdate } from '@/types/database'
import { revalidatePath, updateTag } from 'next/cache'

/**
 * Server side of the CSV/xlsx product import (`/admin/products/import`).
 *
 * Two actions, both re-validating every row through the shared
 * `validateImportRow` (productSchema + buildProductMoneyWrite):
 *
 *   previewProductImport - the dry run. Validates, resolves category names,
 *     checks slugs/skus against the database, writes NOTHING.
 *   importProductsBatch - applies one client-sent batch ATOMICALLY. The
 *     client chunks the valid rows and calls this repeatedly, which is what
 *     drives the progress bar; each batch repeats the existence checks so a
 *     slug inserted by an earlier batch (or by another admin mid-import)
 *     fails its row with a readable message instead of a constraint error.
 *
 * Batch atomicity is compensation, not a transaction: PostgREST cannot span
 * one across requests, and the RPC alternative would sit in
 * `migrations/pending/` unusable until someone approves it. So the batch
 * keeps a journal - inserted ids, and each updated row's prior values for
 * exactly the columns about to change - and a mid-batch failure replays it
 * backwards: inserts are deleted (admins hold `products_delete_unified`),
 * updates restored. The restore can lose a concurrent admin edit made in the
 * seconds between snapshot and rollback; with the dry run in front of every
 * import that trade is taken for not leaving half a batch behind.
 *
 * Modes: `insert` fails a row whose slug exists; `upsert` updates it instead,
 * through `buildUpsertUpdateFields` (only columns present in the file, money
 * always rewritten as a unit, never status/images/supplier/type). Inserted
 * rows always land as `draft`; publishing stays behind the per-product
 * publish gate, which needs a supplier the file cannot carry.
 *
 * The run. Three more actions bracket the batches into one import run that
 * the history page (`/admin/products/import/history`) can list and undo:
 *
 *   startProductImportRun - mints the run id and writes its `created` row.
 *   importProductsBatch(…, run) - each applied batch writes an `updated` row
 *     whose `before` column carries that batch's journal, the same journal the
 *     in-batch rollback replays.
 *   finishProductImportRun - the `status_change` row with the client's totals.
 *   rollbackProductImportRun - merges every batch journal of a finished run
 *     and replays it backwards: inserted products are deleted, updated ones
 *     get their prior columns back. A product edited AFTER the run (its
 *     `updated_at` is newer than the run's last event) is skipped and counted,
 *     because clobbering a later edit is worse than leaving one imported row.
 *
 * All of it lives in `audit_log` (see `lib/admin/product-import/import-history`
 * for why), so it works on production today without a pending migration.
 */

const MAX_PREVIEW_ROWS = 5000
const MAX_BATCH_ROWS = 100
/** PostgREST `in()` filters travel in the URL; keep each chunk well clear of limits. */
const IN_CHUNK = 200

export interface ImportRowResult {
  line: number
  slug: string | null
  name: string | null
  errors: string[]
  /** What the row will do (preview) or did (import); absent on a failed row. */
  action?: 'new' | 'update'
}

export interface ImportPreviewResult {
  error?: string
  rows?: ImportRowResult[]
  summary?: { total: number; valid: number; invalid: number; inserts: number; updates: number }
}

export interface ImportBatchResult {
  error?: string
  results?: ImportRowResult[]
  inserted?: number
  updated?: number
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

type Supabase = Awaited<ReturnType<typeof createClient>>

interface ExistingProduct {
  id: string
  slug: string
  sku: string | null
  type: string
  deleted_at: string | null
}

type CheckedRow = ValidatedImportRow & { existing?: ExistingProduct }

function stripValidity(row: ValidatedImportRow, errors: string[]): ValidatedImportRow {
  const { data: _data, money: _money, ...rest } = row
  return { ...rest, errors }
}

/**
 * The shared, database-touching half of the pipeline: pure validation, then
 * category resolution and slug/sku existence checks. Mutates nothing.
 */
async function checkRows(
  supabase: Supabase,
  raw: RawImportRow[],
  mode: ImportMode,
): Promise<{ rows: CheckedRow[]; categoryIds: Map<string, string>; error?: string }> {
  const rows = markInFileDuplicates(raw.map(validateImportRow))
  const categoryIds = new Map<string, string>()

  // Category names -> ids, one query for the distinct names in the file.
  const names = [...new Set(rows.flatMap((r) => (r.categoryName ? [r.categoryName] : [])))]
  for (const nameChunk of chunk(names, IN_CHUNK)) {
    // excludeDeleted, not a raw `.is('deleted_at', null)`: the helper is the
    // one place that knows whether a table's `deleted_at` exists in
    // production yet, and filtering on a column production lacks fails the
    // whole query with 42703. Live for categories since 185 (2026-09-09).
    const { data, error } = await excludeDeleted(
      supabase.from('categories').select('id, name_he').in('name_he', nameChunk),
      'categories',
    ).eq('is_active', true)
    if (error) return { rows, categoryIds, error: error.message }
    for (const c of data ?? []) categoryIds.set(c.name_he, c.id)
  }

  // Existing products by slug. Soft-deleted rows count too: recreating a slug
  // that an archived product still holds would collide the storefront URL
  // history, and updating an archived product from a CSV makes no sense.
  const slugs = [...new Set(rows.flatMap((r) => (r.data ? [r.data.slug] : [])))]
  const existingBySlug = new Map<string, ExistingProduct>()
  for (const slugChunk of chunk(slugs, IN_CHUNK)) {
    const { data, error } = await supabase
      .from('products')
      .select('id, slug, sku, type, deleted_at')
      .in('slug', slugChunk)
    if (error) return { rows, categoryIds, error: error.message }
    for (const p of data ?? []) existingBySlug.set(p.slug, p)
  }

  // Existing skus and which slug owns each - in upsert mode a sku is only a
  // conflict when a DIFFERENT product holds it.
  const skus = [...new Set(rows.flatMap((r) => (r.data?.sku ? [r.data.sku] : [])))]
  const skuOwner = new Map<string, string>()
  for (const skuChunk of chunk(skus, IN_CHUNK)) {
    const { data, error } = await supabase.from('products').select('slug, sku').in('sku', skuChunk)
    if (error) return { rows, categoryIds, error: error.message }
    for (const p of data ?? []) if (p.sku) skuOwner.set(p.sku, p.slug)
  }

  const checked: CheckedRow[] = rows.map((row) => {
    const errors = [...row.errors]
    const existing = row.data ? existingBySlug.get(row.data.slug) : undefined

    if (existing && mode === 'insert') {
      errors.push('קישור (slug) כבר קיים במערכת')
    }
    if (existing && mode === 'upsert') {
      if (existing.deleted_at !== null) {
        errors.push('המוצר הקיים עם הקישור הזה הועבר לארכיון - שחזרו אותו לפני ייבוא מעדכן')
      } else if ((row.record.type ?? '').trim() === '') {
        // Without an explicit type the validator defaults to physical, and a
        // coupon product would get physical money written over it silently.
        errors.push('בעדכון מוצר קיים חובה למלא את עמודת הסוג (physical/coupon)')
      } else if (row.data && row.data.type !== existing.type) {
        errors.push(
          `סוג המוצר בקובץ (${row.data.type}) שונה מהמוצר הקיים (${existing.type}) - שינוי סוג לא נתמך בייבוא`,
        )
      }
    }

    const sku = row.data?.sku ?? null
    if (sku) {
      const owner = skuOwner.get(sku)
      if (owner !== undefined && (mode === 'insert' || owner !== row.data?.slug)) {
        errors.push(
          mode === 'insert' ? 'מק"ט כבר קיים במערכת' : `מק"ט כבר שייך למוצר אחר (${owner})`,
        )
      }
    }

    if (row.categoryName && !categoryIds.has(row.categoryName)) {
      errors.push(`קטגוריה "${row.categoryName}" לא נמצאה`)
    }

    const base = errors.length === row.errors.length ? row : stripValidity(row, errors)
    return mode === 'upsert' && existing && existing.deleted_at === null
      ? { ...base, existing }
      : base
  })

  return { rows: checked, categoryIds }
}

function toResult(row: CheckedRow): ImportRowResult {
  return {
    line: row.line,
    slug: row.slug,
    name: row.name,
    errors: row.errors,
    ...(row.data ? { action: row.existing ? ('update' as const) : ('new' as const) } : {}),
  }
}

async function runPreview(raw: RawImportRow[], mode: ImportMode): Promise<ImportPreviewResult> {
  try {
    await requireAdminSession()
  } catch {
    return { error: 'אין הרשאה' }
  }
  if (!Array.isArray(raw) || raw.length === 0) return { error: 'לא התקבלו שורות לבדיקה' }
  if (raw.length > MAX_PREVIEW_ROWS) {
    return { error: `הקובץ מכיל יותר מ-${MAX_PREVIEW_ROWS} שורות` }
  }

  const supabase = await createClient()
  const { rows, error } = await checkRows(supabase, raw, mode)
  if (error) return { error }

  const results = rows.map(toResult)
  const valid = results.filter((r) => r.errors.length === 0)
  const updates = valid.filter((r) => r.action === 'update').length
  return {
    rows: results,
    summary: {
      total: results.length,
      valid: valid.length,
      invalid: results.length - valid.length,
      inserts: valid.length - updates,
      updates,
    },
  }
}

type JournalEntry =
  | { kind: 'insert'; id: string }
  | { kind: 'update'; id: string; prior: Record<string, unknown> }

/** Replays the journal backwards. Returns how many entries failed to revert. */
async function rollback(supabase: Supabase, journal: JournalEntry[]): Promise<number> {
  let failures = 0
  for (const entry of [...journal].reverse()) {
    const { error } =
      entry.kind === 'insert'
        ? await supabase.from('products').delete().eq('id', entry.id)
        : await supabase
            .from('products')
            .update(entry.prior as TablesUpdate<'products'>)
            .eq('id', entry.id)
    if (error) failures++
  }
  return failures
}

export interface ImportRunRef {
  id: string
  /** 1-based batch number within the run, for the history's ordering. */
  batch: number
}

/** Server-action args come off the wire; keep only a well-formed run ref. */
function coerceRun(run: unknown): ImportRunRef | null {
  if (typeof run !== 'object' || run === null) return null
  const { id, batch } = run as Record<string, unknown>
  if (typeof id !== 'string' || !UUID.test(id)) return null
  return {
    id,
    batch: typeof batch === 'number' && Number.isInteger(batch) && batch > 0 ? batch : 1,
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function runImportBatch(
  raw: RawImportRow[],
  mode: ImportMode,
  run: ImportRunRef | null,
): Promise<ImportBatchResult> {
  let session: Awaited<ReturnType<typeof requireAdminSession>>
  try {
    session = await requireAdminSession()
  } catch {
    return { error: 'אין הרשאה' }
  }
  if (!Array.isArray(raw) || raw.length === 0) return { error: 'לא התקבלו שורות לייבוא' }
  if (raw.length > MAX_BATCH_ROWS) {
    return { error: `כל קבוצה מוגבלת ל-${MAX_BATCH_ROWS} שורות` }
  }

  const supabase = await createClient()
  const { rows, categoryIds, error } = await checkRows(supabase, raw, mode)
  if (error) return { error }

  const results: ImportRowResult[] = []
  const journal: JournalEntry[] = []
  const insertedSlugs: string[] = []
  const updatedSlugs: string[] = []
  let batchError: string | null = null

  for (const row of rows) {
    if (!row.data || !row.money || row.errors.length > 0) {
      results.push(toResult(row))
      continue
    }

    if (row.existing) {
      const fields = buildUpsertUpdateFields(row)
      if (!fields) {
        results.push(toResult(row))
        continue
      }
      if (row.record.category !== undefined) {
        fields.category_id = row.categoryName ? (categoryIds.get(row.categoryName) ?? null) : null
      }

      // Snapshot exactly the columns about to change, for the rollback path.
      const columns = Object.keys(fields)
      const { data: prior, error: priorError } = await supabase
        .from('products')
        .select(columns.join(',') as '*')
        .eq('id', row.existing.id)
        .maybeSingle()
      if (priorError || !prior) {
        batchError = `שורה ${row.line}: ${priorError?.message ?? 'המוצר לעדכון לא נמצא'}`
        break
      }

      const { error: updateError } = await supabase
        .from('products')
        .update(fields as TablesUpdate<'products'>)
        .eq('id', row.existing.id)
      if (updateError) {
        batchError = `שורה ${row.line}: ${updateError.message}`
        break
      }
      journal.push({
        kind: 'update',
        id: row.existing.id,
        prior: prior as unknown as Record<string, unknown>,
      })
      updatedSlugs.push(row.data.slug)
      results.push(toResult(row))
      continue
    }

    // The same strip as the single-product insert: recurring's three fields
    // are form-only, and whatsapp_enabled targets a column that pending
    // migration 123 has not created - the CSV cannot set it, so it is simply
    // never sent instead of needing that path's retry fallback.
    const {
      id: _id,
      recurring_amount_ils: _recurringIls,
      billing_interval: _interval,
      billing_interval_count: _intervalCount,
      whatsapp_enabled: _whatsapp,
      ...fields
    } = row.data

    const { data: created, error: insertError } = await supabase
      .from('products')
      .insert({
        ...fields,
        ...row.money,
        category_id: row.categoryName ? (categoryIds.get(row.categoryName) ?? null) : null,
        images: [],
        created_by: session.userId,
      })
      .select('id')
      .single()

    if (insertError || !created) {
      batchError = `שורה ${row.line}: ${insertError?.message ?? 'ההוספה נכשלה'}`
      break
    }
    journal.push({ kind: 'insert', id: created.id })
    insertedSlugs.push(row.data.slug)
    results.push(toResult(row))
  }

  if (batchError) {
    const failures = await rollback(supabase, journal)
    const suffix =
      failures > 0
        ? ` (שחזור של ${failures} שורות נכשל - יש לבדוק ידנית)`
        : ' - כל השורות בקבוצה בוטלו (rollback)'
    return { error: `${batchError}${suffix}` }
  }

  if (insertedSlugs.length > 0 || updatedSlugs.length > 0) {
    if (insertedSlugs.length > 0) {
      await writeAuditLog({
        actorId: session.userId,
        actorRole: session.role,
        action: 'created',
        entityType: 'products',
        changes: {
          source: 'file_import',
          run_id: run?.id ?? null,
          inserted: insertedSlugs.length,
          slugs: insertedSlugs,
        },
      })
    }
    if (updatedSlugs.length > 0) {
      await writeAuditLog({
        actorId: session.userId,
        actorRole: session.role,
        action: 'updated',
        entityType: 'products',
        changes: {
          source: 'file_import',
          run_id: run?.id ?? null,
          updated: updatedSlugs.length,
          slugs: updatedSlugs,
        },
      })
    }
    if (run) {
      // The batch's journal, kept for the whole-run rollback. `prior` holds
      // only the columns the update touched, so a later rollback restores
      // exactly those and nothing an admin changed elsewhere since.
      const runJournal: ImportRunJournal = {
        inserts: journal.flatMap((e) => (e.kind === 'insert' ? [e.id] : [])),
        updates: journal.flatMap((e) =>
          e.kind === 'update' ? [{ id: e.id, prior: e.prior }] : [],
        ),
      }
      await writeAuditLog({
        actorId: session.userId,
        actorRole: session.role,
        action: 'updated',
        entityType: IMPORT_RUN_ENTITY,
        entityId: run.id,
        changes: {
          batch: run.batch,
          inserted: insertedSlugs.length,
          updated: updatedSlugs.length,
          slugs_inserted: insertedSlugs,
          slugs_updated: updatedSlugs,
        },
        before: runJournal as unknown as Json,
      })
    }
    revalidatePath('/admin/products')
    updateTag(CATALOGUE_TAG)
  }

  return { results, inserted: insertedSlugs.length, updated: updatedSlugs.length }
}

// ---------------------------------------------------------------------------
// The run: start, finish, history, rollback.
// ---------------------------------------------------------------------------

export interface ImportRunStartInput {
  fileName: string
  mode: ImportMode
  summary: { total: number; valid: number; invalid: number; inserts: number; updates: number }
  /** The canonical column keys the admin mapped, for the history's record. */
  columns: string[]
}

export interface ImportRunStartResult {
  error?: string
  runId?: string
}

function clampInt(value: unknown, max = 1_000_000): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
    ? Math.min(value, max)
    : 0
}

async function runStart(input: ImportRunStartInput): Promise<ImportRunStartResult> {
  let session: Awaited<ReturnType<typeof requireAdminSession>>
  try {
    session = await requireAdminSession()
  } catch {
    return { error: 'אין הרשאה' }
  }
  const runId = crypto.randomUUID()
  const summary = typeof input?.summary === 'object' && input.summary !== null ? input.summary : {}
  await writeAuditLog({
    actorId: session.userId,
    actorRole: session.role,
    action: 'created',
    entityType: IMPORT_RUN_ENTITY,
    entityId: runId,
    changes: {
      file_name: typeof input?.fileName === 'string' ? input.fileName.slice(0, 200) : '',
      mode: coerceMode(input?.mode),
      total: clampInt((summary as Record<string, unknown>).total),
      valid: clampInt((summary as Record<string, unknown>).valid),
      invalid: clampInt((summary as Record<string, unknown>).invalid),
      inserts: clampInt((summary as Record<string, unknown>).inserts),
      updates: clampInt((summary as Record<string, unknown>).updates),
      columns: Array.isArray(input?.columns)
        ? input.columns.filter((c): c is string => typeof c === 'string').slice(0, 50)
        : [],
    },
  })
  return { runId }
}

export interface ImportRunFinishInput {
  status: Exclude<ImportRunStatus, 'running' | 'rolled_back'>
  inserted: number
  updated: number
  failed: number
  error: string | null
  rowErrors: ImportRunRowError[]
}

async function runFinish(runId: string, input: ImportRunFinishInput): Promise<{ error?: string }> {
  let session: Awaited<ReturnType<typeof requireAdminSession>>
  try {
    session = await requireAdminSession()
  } catch {
    return { error: 'אין הרשאה' }
  }
  if (typeof runId !== 'string' || !UUID.test(runId)) return { error: 'מזהה ריצה לא תקין' }
  const status: ImportRunFinishInput['status'] =
    input?.status === 'partial' || input?.status === 'failed' ? input.status : 'done'
  const rowErrors = Array.isArray(input?.rowErrors)
    ? input.rowErrors.slice(0, ROW_ERROR_CAP).map((r) => ({
        line: clampInt(r?.line),
        slug: typeof r?.slug === 'string' ? r.slug.slice(0, 200) : null,
        name: typeof r?.name === 'string' ? r.name.slice(0, 200) : null,
        errors: Array.isArray(r?.errors)
          ? r.errors.filter((e): e is string => typeof e === 'string').map((e) => e.slice(0, 500))
          : [],
      }))
    : []
  await writeAuditLog({
    actorId: session.userId,
    actorRole: session.role,
    action: 'status_change',
    entityType: IMPORT_RUN_ENTITY,
    entityId: runId,
    changes: {
      status,
      inserted: clampInt(input?.inserted),
      updated: clampInt(input?.updated),
      failed: clampInt(input?.failed),
      error: typeof input?.error === 'string' ? input.error.slice(0, 1000) : null,
      row_errors: rowErrors as unknown as Json,
    },
  })
  return {}
}

export interface ImportRollbackResult {
  error?: string
  revertedInserts?: number
  revertedUpdates?: number
  skipped?: number
  failures?: number
}

async function runRollback(runId: string): Promise<ImportRollbackResult> {
  let session: Awaited<ReturnType<typeof requireAdminSession>>
  try {
    session = await requireAdminSession()
  } catch {
    return { error: 'אין הרשאה' }
  }
  if (typeof runId !== 'string' || !UUID.test(runId)) return { error: 'מזהה ריצה לא תקין' }

  const supabase = await createClient()
  const { events, error } = await loadImportRunEvents(supabase, runId)
  if (error) return { error }
  const run = summariseImportRun(events)
  if (!run) return { error: 'ריצת הייבוא לא נמצאה' }
  const refusal = rollbackRefusal(run, Date.now())
  if (refusal) return { error: ROLLBACK_REFUSAL_MESSAGE[refusal] }

  const journal = mergeRunJournal(events)
  const ids = [...new Set([...journal.inserts, ...journal.updates.map((u) => u.id)])]

  // What each product looks like now: gone already, or edited since the run.
  const current = new Map<string, string>()
  for (const idChunk of chunk(ids, IN_CHUNK)) {
    const { data, error: readError } = await supabase
      .from('products')
      .select('id, updated_at')
      .in('id', idChunk)
    if (readError) return { error: readError.message }
    for (const p of data ?? []) current.set(p.id, p.updated_at)
  }
  const cutoff = Date.parse(run.lastEventAt)
  const editedSince = (id: string): boolean => {
    const at = current.get(id)
    return at !== undefined && Date.parse(at) > cutoff
  }

  let revertedInserts = 0
  let revertedUpdates = 0
  let skipped = 0
  let failures = 0

  // Updates first, newest batch first, so a product updated twice in one run
  // ends on its pre-run values.
  for (const entry of [...journal.updates].reverse()) {
    if (!current.has(entry.id)) {
      skipped++
      continue
    }
    if (editedSince(entry.id)) {
      skipped++
      continue
    }
    const { error: updateError } = await supabase
      .from('products')
      .update(entry.prior as TablesUpdate<'products'>)
      .eq('id', entry.id)
    if (updateError) failures++
    else revertedUpdates++
  }
  for (const id of journal.inserts) {
    if (!current.has(id)) {
      // Already deleted by hand: the outcome the rollback wants.
      revertedInserts++
      continue
    }
    if (editedSince(id)) {
      skipped++
      continue
    }
    const { error: deleteError } = await supabase.from('products').delete().eq('id', id)
    if (deleteError) failures++
    else revertedInserts++
  }

  await writeAuditLog({
    actorId: session.userId,
    actorRole: session.role,
    action: 'restored',
    entityType: IMPORT_RUN_ENTITY,
    entityId: runId,
    changes: {
      reverted_inserts: revertedInserts,
      reverted_updates: revertedUpdates,
      skipped,
      failures,
    },
  })
  if (revertedInserts > 0 || revertedUpdates > 0) {
    revalidatePath('/admin/products')
    updateTag(CATALOGUE_TAG)
  }
  revalidatePath('/admin/products/import/history')
  return { revertedInserts, revertedUpdates, skipped, failures }
}

/** Server-action args come off the wire; anything but 'upsert' means insert. */
function coerceMode(mode: unknown): ImportMode {
  return mode === 'upsert' ? 'upsert' : 'insert'
}

export async function previewProductImport(
  raw: RawImportRow[],
  mode: ImportMode = 'insert',
): Promise<ImportPreviewResult> {
  return withActionContext('admin.product.import_preview', () => runPreview(raw, coerceMode(mode)))
}

export async function importProductsBatch(
  raw: RawImportRow[],
  mode: ImportMode = 'insert',
  run?: ImportRunRef,
): Promise<ImportBatchResult> {
  return withActionContext('admin.product.import_batch', () =>
    runImportBatch(raw, coerceMode(mode), coerceRun(run)),
  )
}

export async function startProductImportRun(
  input: ImportRunStartInput,
): Promise<ImportRunStartResult> {
  return withActionContext('admin.product.import_run_start', () => runStart(input))
}

export async function finishProductImportRun(
  runId: string,
  input: ImportRunFinishInput,
): Promise<{ error?: string }> {
  return withActionContext('admin.product.import_run_finish', () => runFinish(runId, input))
}

export async function rollbackProductImportRun(runId: string): Promise<ImportRollbackResult> {
  return withActionContext('admin.product.import_run_rollback', () => runRollback(runId))
}
