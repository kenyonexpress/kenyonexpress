'use server'

import { writeAuditLog } from '@/lib/admin/audit'
import { mapCsvToForms, parseCsv, previewRow } from '@/lib/admin/product-csv'
import { requireAdminSession } from '@/lib/admin/rbac'
import { withActionContext } from '@/lib/observability/action-context'
import { createAdminClient } from '@/lib/supabase/admin'
import { upsertProductNoRedirect } from './products'

export type ProductImportState = {
  error?: string
  imported?: number
  /** Commit failed: every product created in this run was removed again. */
  rolledBack?: number
  failures?: { line: number; error: string }[]
  unknownColumns?: string[]
  /** Dry run: what would be imported, nothing written. */
  preview?: { line: number; fields: Record<string, string> }[]
  dryRun?: boolean
} | null

/**
 * Bulk create from CSV. Each row goes through `upsertProduct`, the same path
 * the form uses, so schema, money, uploader policy and approval all apply.
 * Rows are always drafts.
 */
export async function importProductsCsv(
  _: ProductImportState,
  formData: FormData,
): Promise<ProductImportState> {
  return withActionContext('admin.product.import', () => runImport(formData))
}

async function runImport(formData: FormData): Promise<ProductImportState> {
  // Admin only. A content_uploader's money fields are policy-stripped on the
  // form path; a bulk file is not the place to rely on that.
  const session = await requireAdminSession()

  const file = formData.get('file')
  if (!(file instanceof File) || file.size === 0) return { error: 'לא נבחר קובץ' }
  if (file.size > 1_000_000) return { error: 'הקובץ גדול מדי' }

  const mapped = mapCsvToForms(parseCsv(await file.text()))
  if (!mapped.ok) return { error: mapped.error }

  // DRY RUN FIRST. The form posts mode=preview, shows every row and every
  // problem, and only a second submit with mode=commit writes anything.
  if (formData.get('mode') !== 'commit') {
    return {
      dryRun: true,
      unknownColumns: mapped.unknownColumns,
      failures: mapped.rows.flatMap((r) => (r.ok ? [] : [{ line: r.line, error: r.error }])),
      preview: mapped.rows.flatMap((r) =>
        r.ok ? [{ line: r.line, fields: previewRow(r.form) }] : [],
      ),
    }
  }

  // ALL OR NOTHING. Rows are validated up front, but a write can still fail
  // (slug collision, schema drift). On the first failure every product created
  // in this run is removed, so a file never half-imports.
  const failures: { line: number; error: string }[] = []
  const created: string[] = []
  for (const row of mapped.rows) {
    if (!row.ok) {
      failures.push({ line: row.line, error: row.error })
      break
    }
    const result = await upsertProductNoRedirect(row.form)
    if (result && 'error' in result) {
      failures.push({ line: row.line, error: result.error })
      break
    }
    if (result && 'id' in result && result.id) created.push(result.id)
  }
  if (failures.length > 0) {
    const rolledBack = await rollbackCreated(created)
    await writeAuditLog({
      actorId: session.userId,
      actorRole: session.role,
      action: 'deleted',
      entityType: 'products',
      entityId: 'csv-import',
      changes: { old: { created: created.length }, new: { rolled_back: rolledBack } },
    })
    return {
      error: 'הייבוא בוטל: אף מוצר לא נשמר',
      failures,
      rolledBack,
      unknownColumns: mapped.unknownColumns,
    }
  }
  const imported = created.length
  await writeAuditLog({
    actorId: session.userId,
    actorRole: session.role,
    action: 'created',
    entityType: 'products',
    entityId: 'csv-import',
    changes: { old: null, new: { imported, failed: failures.length, rows: mapped.rows.length } },
  })
  return { imported, failures, unknownColumns: mapped.unknownColumns }
}

/** Hard-deletes drafts this import just inserted. Returns how many were removed. */
async function rollbackCreated(ids: string[]): Promise<number> {
  if (ids.length === 0) return 0
  const admin = createAdminClient()
  await admin.from('product_variants').delete().in('product_id', ids)
  const { data } = await admin.from('products').delete().in('id', ids).select('id')
  return data?.length ?? 0
}
