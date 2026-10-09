'use server'

import { writeAuditLog } from '@/lib/admin/audit'
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
import type { TablesUpdate } from '@/types/database'
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

async function runImportBatch(raw: RawImportRow[], mode: ImportMode): Promise<ImportBatchResult> {
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
        changes: { source: 'file_import', inserted: insertedSlugs.length, slugs: insertedSlugs },
      })
    }
    if (updatedSlugs.length > 0) {
      await writeAuditLog({
        actorId: session.userId,
        actorRole: session.role,
        action: 'updated',
        entityType: 'products',
        changes: { source: 'file_import', updated: updatedSlugs.length, slugs: updatedSlugs },
      })
    }
    revalidatePath('/admin/products')
    updateTag(CATALOGUE_TAG)
  }

  return { results, inserted: insertedSlugs.length, updated: updatedSlugs.length }
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
): Promise<ImportBatchResult> {
  return withActionContext('admin.product.import_batch', () =>
    runImportBatch(raw, coerceMode(mode)),
  )
}
