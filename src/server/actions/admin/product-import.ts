'use server'

import { writeAuditLog } from '@/lib/admin/audit'
import {
  type RawImportRow,
  type ValidatedImportRow,
  markInFileDuplicates,
  validateImportRow,
} from '@/lib/admin/product-import/import-rows'
import { requireAdminSession } from '@/lib/admin/rbac'
import { CATALOGUE_TAG } from '@/lib/catalogue-cache'
import { withActionContext } from '@/lib/observability/action-context'
import { excludeDeleted } from '@/lib/soft-delete'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath, updateTag } from 'next/cache'

/**
 * Server side of the CSV product import (`/admin/products/import`).
 *
 * Two actions, both re-validating every row through the shared
 * `validateImportRow` (productSchema + buildProductMoneyWrite):
 *
 *   previewProductImport - the dry run. Validates, resolves category names,
 *     checks slugs/skus against the database, writes NOTHING.
 *   importProductsBatch - inserts one client-sent batch. The client chunks the
 *     valid rows and calls this repeatedly, which is what drives the progress
 *     bar; each batch repeats the existence checks so a slug inserted by an
 *     earlier batch (or by another admin mid-import) fails its row with a
 *     readable message instead of a constraint error.
 *
 * Every import lands as `draft`. Publishing stays behind the per-product
 * publish gate, which needs a supplier the CSV cannot carry.
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
}

export interface ImportPreviewResult {
  error?: string
  rows?: ImportRowResult[]
  summary?: { total: number; valid: number; invalid: number }
}

export interface ImportBatchResult {
  error?: string
  results?: ImportRowResult[]
  inserted?: number
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

type Supabase = Awaited<ReturnType<typeof createClient>>

/**
 * The shared, database-touching half of the pipeline: pure validation, then
 * category resolution and slug/sku existence checks. Mutates nothing.
 */
async function checkRows(
  supabase: Supabase,
  raw: RawImportRow[],
): Promise<{ rows: ValidatedImportRow[]; categoryIds: Map<string, string>; error?: string }> {
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

  // Existing slugs/skus. Soft-deleted rows count too: recreating a slug that an
  // archived product still holds would collide the storefront URL history.
  const slugs = [...new Set(rows.flatMap((r) => (r.data ? [r.data.slug] : [])))]
  const existingSlugs = new Set<string>()
  for (const slugChunk of chunk(slugs, IN_CHUNK)) {
    const { data, error } = await supabase.from('products').select('slug').in('slug', slugChunk)
    if (error) return { rows, categoryIds, error: error.message }
    for (const p of data ?? []) existingSlugs.add(p.slug)
  }

  const skus = [...new Set(rows.flatMap((r) => (r.data?.sku ? [r.data.sku] : [])))]
  const existingSkus = new Set<string>()
  for (const skuChunk of chunk(skus, IN_CHUNK)) {
    const { data, error } = await supabase.from('products').select('sku').in('sku', skuChunk)
    if (error) return { rows, categoryIds, error: error.message }
    for (const p of data ?? []) if (p.sku) existingSkus.add(p.sku)
  }

  const checked = rows.map((row) => {
    const errors = [...row.errors]
    if (row.data && existingSlugs.has(row.data.slug)) {
      errors.push('קישור (slug) כבר קיים במערכת')
    }
    if (row.data?.sku && existingSkus.has(row.data.sku)) {
      errors.push('מק"ט כבר קיים במערכת')
    }
    if (row.categoryName && !categoryIds.has(row.categoryName)) {
      errors.push(`קטגוריה "${row.categoryName}" לא נמצאה`)
    }
    if (errors.length === row.errors.length) return row
    const { data: _data, money: _money, ...rest } = row
    return { ...rest, errors }
  })

  return { rows: checked, categoryIds }
}

function toResult(row: ValidatedImportRow): ImportRowResult {
  return { line: row.line, slug: row.slug, name: row.name, errors: row.errors }
}

async function runPreview(raw: RawImportRow[]): Promise<ImportPreviewResult> {
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
  const { rows, error } = await checkRows(supabase, raw)
  if (error) return { error }

  const results = rows.map(toResult)
  const valid = results.filter((r) => r.errors.length === 0).length
  return {
    rows: results,
    summary: { total: results.length, valid, invalid: results.length - valid },
  }
}

async function runImportBatch(raw: RawImportRow[]): Promise<ImportBatchResult> {
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
  const { rows, categoryIds, error } = await checkRows(supabase, raw)
  if (error) return { error }

  const results: ImportRowResult[] = []
  const insertedSlugs: string[] = []

  for (const row of rows) {
    if (!row.data || !row.money) {
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

    const { error: insertError } = await supabase.from('products').insert({
      ...fields,
      ...row.money,
      category_id: row.categoryName ? (categoryIds.get(row.categoryName) ?? null) : null,
      images: [],
      created_by: session.userId,
    })

    if (insertError) {
      results.push({ ...toResult(row), errors: [insertError.message] })
      continue
    }
    insertedSlugs.push(row.data.slug)
    results.push(toResult(row))
  }

  if (insertedSlugs.length > 0) {
    await writeAuditLog({
      actorId: session.userId,
      actorRole: session.role,
      action: 'created',
      entityType: 'products',
      changes: { source: 'csv_import', inserted: insertedSlugs.length, slugs: insertedSlugs },
    })
    revalidatePath('/admin/products')
    updateTag(CATALOGUE_TAG)
  }

  return { results, inserted: insertedSlugs.length }
}

export async function previewProductImport(raw: RawImportRow[]): Promise<ImportPreviewResult> {
  return withActionContext('admin.product.import_preview', () => runPreview(raw))
}

export async function importProductsBatch(raw: RawImportRow[]): Promise<ImportBatchResult> {
  return withActionContext('admin.product.import_batch', () => runImportBatch(raw))
}
