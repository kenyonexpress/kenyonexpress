'use server'

import { writeAuditLog } from '@/lib/admin/audit'
import { mapCsvToForms, parseCsv } from '@/lib/admin/product-csv'
import { requireAdminSession } from '@/lib/admin/rbac'
import { withActionContext } from '@/lib/observability/action-context'
import { upsertProduct } from './products'

export type ProductImportState = {
  error?: string
  imported?: number
  failures?: { line: number; error: string }[]
  unknownColumns?: string[]
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

  const failures: { line: number; error: string }[] = []
  let imported = 0
  for (const row of mapped.rows) {
    if (!row.ok) {
      failures.push({ line: row.line, error: row.error })
      continue
    }
    const result = await upsertProduct(null, row.form)
    if (result && 'error' in result) failures.push({ line: row.line, error: result.error })
    else imported++
  }
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
