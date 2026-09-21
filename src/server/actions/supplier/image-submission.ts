'use server'

import { writeAuditLog } from '@/lib/admin/audit'
import { withActionContext } from '@/lib/observability/action-context'
import { log } from '@/lib/observability/log'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import {
  PENDING_BUCKET,
  isSubmissionKind,
  pendingObjectPath,
  validateAlt,
  validateSubmissionFile,
} from '@/lib/supplier/image-submissions'
import { requireSupplierRole } from '@/lib/supplier/rbac'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

/**
 * A supplier uploads a product image or a shop logo for approval.
 *
 * The object and the row are BOTH written with the service role, on purpose:
 * 232 gives client roles no INSERT on `supplier_image_submissions` and no
 * policy at all on the `supplier-pending` bucket, so the only way a row can
 * exist is through this action, after the file was checked and stored. The
 * supplier's ownership of the product is checked here against `products`,
 * since the row is not filed through their session.
 */

const TABLE_ABSENT = new Set(['PGRST205', 'PGRST106', '42P01'])
const uuid = z.string().uuid()

export type ImageSubmissionState = { ok: boolean; message?: string; error?: string }

function pathFor(kind: 'product' | 'logo'): string {
  return kind === 'logo' ? '/supplier/settings' : '/supplier/products'
}

async function runSubmitSupplierImage(formData: FormData): Promise<ImageSubmissionState> {
  const kindRaw = formData.get('kind')
  if (!isSubmissionKind(kindRaw)) return { ok: false, error: 'סוג העלאה לא מוכר.' }
  const kind = kindRaw
  const session = await requireSupplierRole('owner', pathFor(kind))

  const file = formData.get('file')
  if (!(file instanceof File)) return { ok: false, error: 'יש לבחור קובץ.' }
  const checked = validateSubmissionFile({ type: file.type, size: file.size }, kind)
  if (!checked.ok) return { ok: false, error: checked.error }
  const alt = validateAlt(formData.get('alt_he'))
  if (!alt.ok) return { ok: false, error: alt.error }

  const admin = createAdminClient()
  let productId: string | null = null
  if (kind === 'product') {
    const raw = String(formData.get('product_id') ?? '')
    if (!uuid.safeParse(raw).success) return { ok: false, error: 'מוצר לא מוכר.' }
    const { data: product, error } = await admin
      .from('products')
      .select('id, supplier_id')
      .eq('id', raw)
      .maybeSingle()
    if (error) {
      log.warn('supplier.image_submission_product_read_failed', { reason: error.message })
      return { ok: false, error: 'לא הצלחנו לטעון את המוצר. נסו שוב.' }
    }
    if (!product || product.supplier_id !== session.supplierId) {
      return { ok: false, error: 'המוצר אינו משויך לעסק שלכם.' }
    }
    productId = product.id
  }

  const path = pendingObjectPath(session.supplierId, kind, checked.ext)
  const bytes = Buffer.from(await file.arrayBuffer())
  const { error: uploadError } = await admin.storage.from(PENDING_BUCKET).upload(path, bytes, {
    contentType: file.type,
    upsert: false,
  })
  if (uploadError) {
    log.warn('supplier.image_submission_upload_failed', { reason: uploadError.message })
    return { ok: false, error: 'ההעלאה נכשלה. נסו שוב.' }
  }

  const { error } = await admin.from('supplier_image_submissions' as never).insert({
    supplier_id: session.supplierId,
    kind,
    product_id: productId,
    storage_bucket: PENDING_BUCKET,
    storage_path: path,
    mime_type: file.type,
    byte_size: file.size,
    alt_he: alt.alt,
    submitted_by: session.userId,
    status: 'pending',
  } as never)
  if (error) {
    // The object must not outlive a row that failed: an orphan in the pending
    // bucket is storage nobody can list from the admin screen.
    await admin.storage.from(PENDING_BUCKET).remove([path])
    if (TABLE_ABSENT.has(error.code ?? '')) {
      log.warn('supplier.image_submission_table_absent', { code: error.code })
      return { ok: false, error: 'העלאת תמונות לאישור עדיין לא זמינה.' }
    }
    log.warn('supplier.image_submission_failed', { reason: error.message })
    return { ok: false, error: 'השמירה נכשלה.' }
  }

  await writeAuditLog({
    actorId: session.userId,
    actorRole: 'vendor',
    action: 'created',
    entityType: 'supplier_image_submission',
    entityId: productId ?? session.supplierId,
    changes: { kind, storage_path: path, byte_size: file.size },
    metadata: { via: 'supplier_portal', supplier_id: session.supplierId },
  })
  revalidatePath(pathFor(kind))
  return { ok: true, message: 'התמונה נשלחה לאישור.' }
}

async function runWithdrawImageSubmission(submissionId: string): Promise<ImageSubmissionState> {
  const session = await requireSupplierRole('owner', '/supplier/products')
  if (!uuid.safeParse(submissionId).success) return { ok: false, error: 'בקשה לא מוכרת.' }
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('supplier_image_submissions' as never)
    .update({ status: 'withdrawn', decided_at: new Date().toISOString() } as never)
    .eq('id', submissionId)
    .eq('supplier_id', session.supplierId)
    .eq('status', 'pending')
    .select('id, kind, storage_bucket, storage_path')
  if (error) {
    log.warn('supplier.image_submission_withdraw_failed', { reason: error.message })
    return { ok: false, error: 'הביטול נכשל.' }
  }
  const rows = (data ?? []) as {
    id: string
    kind: string
    storage_bucket: string
    storage_path: string
  }[]
  const row = rows[0]
  if (!row) return { ok: false, error: 'הבקשה לא נמצאה או כבר טופלה.' }
  // The pending object has no reader once the row is withdrawn.
  await createAdminClient().storage.from(row.storage_bucket).remove([row.storage_path])
  revalidatePath(pathFor(row.kind === 'logo' ? 'logo' : 'product'))
  return { ok: true, message: 'הבקשה בוטלה.' }
}

export async function submitSupplierImage(formData: FormData): Promise<ImageSubmissionState> {
  return withActionContext('supplier.image_submission.create', () =>
    runSubmitSupplierImage(formData),
  )
}

export async function withdrawImageSubmission(submissionId: string): Promise<ImageSubmissionState> {
  return withActionContext('supplier.image_submission.withdraw', () =>
    runWithdrawImageSubmission(submissionId),
  )
}
