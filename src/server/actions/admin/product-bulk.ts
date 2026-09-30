'use server'

import { writeAuditLog } from '@/lib/admin/audit'
import {
  BULK_PRODUCT_COLUMNS,
  type BulkOperation,
  type BulkProductRow,
  type PlanContext,
  bulkOperationSchema,
  describeOperation,
  planProductChange,
} from '@/lib/admin/product-bulk/plan'
import { matchR2KeysToSkus } from '@/lib/admin/product-bulk/r2-images'
import {
  type BulkScope,
  bulkScopeSchema,
  describeScope,
  skuGlobToLike,
} from '@/lib/admin/product-bulk/scope'
import { IMPORT_RUN_ENTITY } from '@/lib/admin/product-import/import-history'
import { requireAdminSession } from '@/lib/admin/rbac'
import { CATALOGUE_TAG } from '@/lib/catalogue-cache'
import { isAllowedImageUrl } from '@/lib/images/remote-hosts'
import { withActionContext } from '@/lib/observability/action-context'
import { isR2StorageConfigured, listR2Objects, r2ObjectPublicUrl } from '@/lib/storage/r2-service'
import { createClient } from '@/lib/supabase/server'
import { likeContains } from '@/lib/utils/search-escape'
import type { Json, TablesUpdate } from '@/types/database'
import { revalidatePath, updateTag } from 'next/cache'

/**
 * Server side of the scoped bulk edit (`/admin/products/bulk`).
 *
 * Same shape as the CSV import next door, on purpose:
 *
 *   previewProductBulkEdit  - the dry run. Resolves the scope to rows, plans
 *     every row through `planProductChange`, writes NOTHING, returns what
 *     would change and why the rest would not.
 *   startProductBulkRun     - opens a run in `audit_log` under the SAME
 *     entity the import uses (`product_import_run`, kind `bulk`), so the
 *     history page lists it and `rollbackProductImportRun` can undo it.
 *   applyProductBulkBatch   - applies up to MAX_BATCH ids atomically-by-
 *     compensation: re-reads the rows, re-plans them against their CURRENT
 *     values (the preview may be minutes old), writes, and on a mid-batch
 *     failure restores what it already wrote. The batch journal (each row's
 *     prior values for exactly the columns written) lands on the run's
 *     `updated` event, which is what the whole-run rollback replays.
 *
 * The client finishes the run with `finishProductImportRun`, unchanged.
 *
 * Money never leaves integer arithmetic: the planner scales prices in
 * agorot through applyBp and re-derives a coupon's badge from its prices.
 * Admin tier only (`requireAdminSession`), see `authorise`.
 */

/** Most rows one scope may match. Above this the admin narrows the scope. */
const MAX_SCOPE_ROWS = 2000
/** Rows the preview sends back in full; the ids of ALL changes travel separately. */
const PREVIEW_ROW_LIMIT = 500
const MAX_BATCH = 100
const IN_CHUNK = 200

type Supabase = Awaited<ReturnType<typeof createClient>>

export interface BulkPreviewRow {
  id: string
  slug: string
  name: string
  sku: string | null
  status: 'change' | 'skip' | 'unchanged'
  reason?: string
  before?: Record<string, unknown>
  after?: Record<string, unknown>
}

export interface BulkPreviewSummary {
  matched: number
  changes: number
  skipped: number
  unchanged: number
  /** True when the scope hit MAX_SCOPE_ROWS and rows beyond it were not read. */
  scopeTruncated: boolean
  /** For images: how many keys were listed, and whether the listing hit its cap. */
  r2Keys?: number
  r2Truncated?: boolean
}

export interface BulkPreviewResult {
  error?: string
  rows?: BulkPreviewRow[]
  /** Every id that would change, in scope order, for the client to batch. */
  changeIds?: string[]
  summary?: BulkPreviewSummary
  /** Hebrew label of the operation and the scope, for the confirm and the run. */
  label?: string
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

type AdminSession = Awaited<ReturnType<typeof requireAdminSession>>

/**
 * Admin tier only, like the CSV import and unlike the per-row bulk bar on
 * the list: a scoped edit can touch the whole catalogue in one press, and
 * the uploader policy that forces a content_uploader's single-product edits
 * back to pending has no equivalent here.
 */
async function authorise(): Promise<{ session: AdminSession } | { error: string }> {
  try {
    return { session: await requireAdminSession() }
  } catch {
    return { error: 'אין הרשאה' }
  }
}

function parseOperation(raw: unknown): { op: BulkOperation } | { error: string } {
  const parsed = bulkOperationSchema.safeParse(raw)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return { error: first?.message ?? 'פעולה לא תקינה' }
  }
  return { op: parsed.data }
}

function parseScope(raw: unknown): { scope: BulkScope } | { error: string } {
  const parsed = bulkScopeSchema.safeParse(raw ?? {})
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return { error: first?.message ?? 'סינון לא תקין' }
  }
  return { scope: parsed.data }
}

async function loadScope(
  supabase: Supabase,
  scope: BulkScope,
): Promise<{ rows: BulkProductRow[]; truncated: boolean; error?: string }> {
  let query = supabase
    .from('products')
    .select(BULK_PRODUCT_COLUMNS)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })
    .limit(MAX_SCOPE_ROWS + 1)
  if (scope.skuPattern) query = query.ilike('sku', skuGlobToLike(scope.skuPattern))
  if (scope.q) query = query.ilike('name_he', likeContains(scope.q))
  if (scope.categoryId) query = query.eq('category_id', scope.categoryId)
  if (scope.status) query = query.eq('status', scope.status)
  if (scope.type) query = query.eq('type', scope.type)
  const { data, error } = await query
  if (error) return { rows: [], truncated: false, error: error.message }
  const rows = (data ?? []) as unknown as BulkProductRow[]
  return { rows: rows.slice(0, MAX_SCOPE_ROWS), truncated: rows.length > MAX_SCOPE_ROWS }
}

async function loadByIds(
  supabase: Supabase,
  ids: string[],
): Promise<{ rows: BulkProductRow[]; error?: string }> {
  const rows: BulkProductRow[] = []
  for (const idChunk of chunk(ids, IN_CHUNK)) {
    const { data, error } = await supabase
      .from('products')
      .select(BULK_PRODUCT_COLUMNS)
      .is('deleted_at', null)
      .in('id', idChunk)
    if (error) return { rows: [], error: error.message }
    rows.push(...((data ?? []) as unknown as BulkProductRow[]))
  }
  // Keep the caller's order so batches replay in scope order.
  const index = new Map(ids.map((id, i) => [id, i]))
  rows.sort((a, b) => (index.get(a.id) ?? 0) - (index.get(b.id) ?? 0))
  return { rows }
}

/**
 * For the images operation: lists the public bucket under the prefix and
 * maps every SKU in scope to its image URLs. The host check is not
 * paranoia: `products.images` feeds `next/image`, which THROWS on a host
 * outside the allowlist, so an unlisted `R2_PUBLIC_BASE_URL` would 500 every
 * product page this tool touched.
 */
async function buildImageContext(
  rows: BulkProductRow[],
  op: Extract<BulkOperation, { kind: 'images' }>,
): Promise<{ ctx: PlanContext; keys: number; truncated: boolean } | { error: string }> {
  if (!isR2StorageConfigured()) {
    return {
      error:
        'אחסון R2 לא מוגדר בסביבה הזו (R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY)',
    }
  }
  let listed: Awaited<ReturnType<typeof listR2Objects>>
  try {
    listed = await listR2Objects('product-images', op.prefix)
  } catch (e) {
    return { error: `קריאת R2 נכשלה: ${e instanceof Error ? e.message : String(e)}` }
  }
  const skus = rows.flatMap((r) => (r.sku ? [r.sku] : []))
  const matched = matchR2KeysToSkus(listed.keys, skus)
  const imagesBySku = new Map<string, string[]>()
  for (const [sku, keys] of matched) {
    const urls: string[] = []
    for (const key of keys) {
      let url: string
      try {
        url = r2ObjectPublicUrl('product-images', key)
      } catch (e) {
        return { error: e instanceof Error ? e.message : String(e) }
      }
      if (!isAllowedImageUrl(url)) {
        return {
          error: `כתובת ה-CDN של R2 (${url}) אינה ברשימת המארחים המותרים לתמונות; יש להוסיף אותה ב-lib/images/remote-hosts לפני שיוך`,
        }
      }
      urls.push(url)
    }
    imagesBySku.set(sku, urls)
  }
  return { ctx: { imagesBySku }, keys: listed.keys.length, truncated: listed.truncated }
}

function toPreviewRow(row: BulkProductRow, op: BulkOperation, ctx: PlanContext): BulkPreviewRow {
  const outcome = planProductChange(row, op, ctx)
  const base = { id: row.id, slug: row.slug, name: row.name_he, sku: row.sku }
  if (outcome.status === 'change') {
    return { ...base, status: 'change', before: outcome.prior, after: outcome.fields }
  }
  if (outcome.status === 'skip') return { ...base, status: 'skip', reason: outcome.reason }
  return { ...base, status: 'unchanged' }
}

async function runPreview(rawScope: unknown, rawOp: unknown): Promise<BulkPreviewResult> {
  const op = parseOperation(rawOp)
  if ('error' in op) return { error: op.error }
  const auth = await authorise()
  if ('error' in auth) return { error: auth.error }
  const scope = parseScope(rawScope)
  if ('error' in scope) return { error: scope.error }

  const supabase = await createClient()
  const loaded = await loadScope(supabase, scope.scope)
  if (loaded.error) return { error: loaded.error }

  let ctx: PlanContext = {}
  let r2: { keys: number; truncated: boolean } | undefined
  if (op.op.kind === 'images') {
    const built = await buildImageContext(loaded.rows, op.op)
    if ('error' in built) return { error: built.error }
    ctx = built.ctx
    r2 = { keys: built.keys, truncated: built.truncated }
  }

  const rows = loaded.rows.map((row) => toPreviewRow(row, op.op, ctx))
  const changes = rows.filter((r) => r.status === 'change')
  const skipped = rows.filter((r) => r.status === 'skip').length

  let categoryName: string | null = null
  if (scope.scope.categoryId) {
    const { data, error: categoryError } = await supabase
      .from('categories')
      .select('name_he')
      .eq('id', scope.scope.categoryId)
      .maybeSingle()
    if (categoryError) return { error: categoryError.message }
    categoryName = data?.name_he ?? null
  }

  // Changes first so the admin sees what matters within the preview limit.
  const ordered = [...changes, ...rows.filter((r) => r.status !== 'change')]
  return {
    rows: ordered.slice(0, PREVIEW_ROW_LIMIT),
    changeIds: changes.map((r) => r.id),
    label: `${describeOperation(op.op)} · ${describeScope(scope.scope, categoryName)}`,
    summary: {
      matched: rows.length,
      changes: changes.length,
      skipped,
      unchanged: rows.length - changes.length - skipped,
      scopeTruncated: loaded.truncated,
      ...(r2 ? { r2Keys: r2.keys, r2Truncated: r2.truncated } : {}),
    },
  }
}

export interface BulkRunStartInput {
  label: string
  summary: { matched: number; changes: number; skipped: number }
}

function clampInt(value: unknown, max = 1_000_000): number {
  const n = typeof value === 'number' ? Math.trunc(value) : Number.NaN
  return Number.isFinite(n) && n >= 0 ? Math.min(n, max) : 0
}

async function runStart(
  rawOp: unknown,
  input: BulkRunStartInput,
): Promise<{ runId?: string; error?: string }> {
  const op = parseOperation(rawOp)
  if ('error' in op) return { error: op.error }
  const auth = await authorise()
  if ('error' in auth) return { error: auth.error }

  const runId = crypto.randomUUID()
  const summary = typeof input?.summary === 'object' && input.summary !== null ? input.summary : {}
  const s = summary as Record<string, unknown>
  await writeAuditLog({
    actorId: auth.session.userId,
    actorRole: auth.session.role,
    action: 'created',
    entityType: IMPORT_RUN_ENTITY,
    entityId: runId,
    changes: {
      kind: 'bulk',
      file_name:
        typeof input?.label === 'string' && input.label.trim() !== ''
          ? input.label.slice(0, 200)
          : describeOperation(op.op),
      mode: 'upsert',
      operation: op.op as unknown as Json,
      total: clampInt(s.matched),
      valid: clampInt(s.changes),
      invalid: clampInt(s.skipped),
      inserts: 0,
      updates: clampInt(s.changes),
      columns: [],
    },
  })
  return { runId }
}

export interface BulkRunRef {
  id: string
  /** 1-based batch number within the run, for the history's ordering. */
  batch: number
}

export interface BulkRowResult {
  id: string
  slug: string
  name: string
  errors: string[]
}

export interface BulkBatchResult {
  error?: string
  updated?: number
  /** Rows re-planned as skip/unchanged at apply time (changed since the preview). */
  skipped?: number
  results?: BulkRowResult[]
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type JournalEntry = { id: string; prior: Record<string, unknown> }

async function restore(supabase: Supabase, journal: JournalEntry[]): Promise<number> {
  let failures = 0
  for (const entry of [...journal].reverse()) {
    const { error } = await supabase
      .from('products')
      .update(entry.prior as TablesUpdate<'products'>)
      .eq('id', entry.id)
    if (error) failures++
  }
  return failures
}

async function runApplyBatch(
  rawIds: unknown,
  rawOp: unknown,
  rawRun: unknown,
): Promise<BulkBatchResult> {
  const op = parseOperation(rawOp)
  if ('error' in op) return { error: op.error }
  const auth = await authorise()
  if ('error' in auth) return { error: auth.error }

  const ids = Array.isArray(rawIds)
    ? [...new Set(rawIds.filter((id): id is string => typeof id === 'string' && UUID.test(id)))]
    : []
  if (ids.length === 0) return { error: 'לא התקבלו מוצרים לעדכון' }
  if (ids.length > MAX_BATCH) return { error: `כל קבוצה מוגבלת ל-${MAX_BATCH} מוצרים` }

  const run =
    typeof rawRun === 'object' && rawRun !== null ? (rawRun as Record<string, unknown>) : null
  const runId = run && typeof run.id === 'string' && UUID.test(run.id) ? run.id : null
  const batchNumber =
    run && typeof run.batch === 'number' && Number.isInteger(run.batch) && run.batch > 0
      ? run.batch
      : 1

  const supabase = await createClient()
  const loaded = await loadByIds(supabase, ids)
  if (loaded.error) return { error: loaded.error }

  let ctx: PlanContext = {}
  if (op.op.kind === 'images') {
    const built = await buildImageContext(loaded.rows, op.op)
    if ('error' in built) return { error: built.error }
    ctx = built.ctx
  }

  const results: BulkRowResult[] = []
  const journal: JournalEntry[] = []
  let skipped = 0
  let batchError: string | null = null

  for (const row of loaded.rows) {
    const outcome = planProductChange(row, op.op, ctx)
    const base = { id: row.id, slug: row.slug, name: row.name_he }
    if (outcome.status !== 'change') {
      skipped++
      results.push({
        ...base,
        errors: outcome.status === 'skip' ? [outcome.reason] : ['ללא שינוי (השתנה מאז הבדיקה)'],
      })
      continue
    }
    const { error } = await supabase
      .from('products')
      .update(outcome.fields as TablesUpdate<'products'>)
      .eq('id', row.id)
    if (error) {
      batchError = `${row.slug}: ${error.message}`
      break
    }
    journal.push({ id: row.id, prior: outcome.prior })
    results.push({ ...base, errors: [] })
  }

  if (batchError) {
    const failures = await restore(supabase, journal)
    const suffix =
      failures > 0
        ? ` (שחזור של ${failures} מוצרים נכשל - יש לבדוק ידנית)`
        : ' - כל השינויים בקבוצה בוטלו (rollback)'
    return { error: `${batchError}${suffix}` }
  }

  if (journal.length > 0) {
    await writeAuditLog({
      actorId: auth.session.userId,
      actorRole: auth.session.role,
      action: 'updated',
      entityType: IMPORT_RUN_ENTITY,
      entityId: runId ?? crypto.randomUUID(),
      changes: {
        kind: 'bulk',
        batch: batchNumber,
        inserted: 0,
        updated: journal.length,
        skipped,
        operation: op.op as unknown as Json,
      },
      before: { inserts: [], updates: journal } as unknown as Json,
    })
    revalidatePath('/admin/products')
    updateTag(CATALOGUE_TAG)
  }

  return { updated: journal.length, skipped, results }
}

export async function previewProductBulkEdit(
  scope: unknown,
  operation: unknown,
): Promise<BulkPreviewResult> {
  return withActionContext('admin.product.bulk_preview', () => runPreview(scope, operation))
}

export async function startProductBulkRun(
  operation: unknown,
  input: BulkRunStartInput,
): Promise<{ runId?: string; error?: string }> {
  return withActionContext('admin.product.bulk_run_start', () => runStart(operation, input))
}

export async function applyProductBulkBatch(
  ids: string[],
  operation: unknown,
  run?: BulkRunRef,
): Promise<BulkBatchResult> {
  return withActionContext('admin.product.bulk_batch', () => runApplyBatch(ids, operation, run))
}
