'use server'

import { writeAuditLog } from '@/lib/admin/audit'
import { type AdminSessionInfo, requireAdminSession } from '@/lib/admin/rbac'
import { CATALOGUE_TAG } from '@/lib/catalogue-cache'
import { withActionContext } from '@/lib/observability/action-context'
import { log } from '@/lib/observability/log'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  PUBLISH_BUCKET,
  type SubmissionKind,
  isSubmissionKind,
  publishedObjectPath,
} from '@/lib/supplier/image-submissions'
import { revalidatePath, updateTag } from 'next/cache'
import sharp from 'sharp'
import { z } from 'zod'

/**
 * An admin publishes or rejects a supplier's uploaded image.
 *
 * Publishing is a copy from the private pending bucket to the public one the
 * catalogue already serves from, and only then a pointer on the product (an
 * appended `products.images` entry) or the shop (`suppliers.logo_url`). The
 * bytes are decoded with sharp before the copy: the MIME type the supplier's
 * browser reported was a claim, and a file that does not decode is rejected
 * here rather than becoming a broken image on the catalogue.
 */

const TABLE_ABSENT = new Set(['PGRST205', 'PGRST106', '42P01'])
const DECODABLE = new Set(['jpeg', 'png', 'webp'])

const decisionSchema = z.object({
  id: z.string().uuid(),
  note: z.string().max(1000).optional(),
})

export type SubmissionDecisionState = { error: string } | { success: string } | null

type SubmissionRow = {
  id: string
  supplier_id: string
  kind: string
  product_id: string | null
  storage_bucket: string
  storage_path: string
  mime_type: string
  alt_he: string
  status: string
}

async function loadPending(id: string): Promise<{ row?: SubmissionRow; error?: string }> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('supplier_image_submissions' as never)
    .select(
      'id, supplier_id, kind, product_id, storage_bucket, storage_path, mime_type, alt_he, status',
    )
    .eq('id', id)
    .maybeSingle()
  if (error) {
    if (TABLE_ABSENT.has(error.code ?? '')) return { error: 'העלאות לאישור עדיין לא זמינות.' }
    log.warn('admin.image_submission_read_failed', { reason: error.message })
    return { error: 'קריאת הבקשה נכשלה.' }
  }
  const row = data as SubmissionRow | null
  if (!row) return { error: 'הבקשה לא נמצאה.' }
  if (row.status !== 'pending') return { error: 'הבקשה כבר טופלה.' }
  return { row }
}

async function markDecided(
  row: SubmissionRow,
  status: 'approved' | 'rejected',
  session: AdminSessionInfo,
  note: string | undefined,
  publishedUrl: string | null,
): Promise<string | null> {
  const admin = createAdminClient()
  const { error } = await admin
    .from('supplier_image_submissions' as never)
    .update({
      status,
      decided_by: session.userId,
      decided_at: new Date().toISOString(),
      decision_note: note?.trim() || null,
      published_url: publishedUrl,
    } as never)
    .eq('id', row.id)
  if (error) {
    log.error('admin.image_submission_mark_failed', { submissionId: row.id, reason: error.message })
    return error.message
  }
  return null
}

async function runApproveImageSubmission(
  id: string,
  note?: string,
): Promise<SubmissionDecisionState> {
  let session: AdminSessionInfo
  try {
    session = await requireAdminSession()
  } catch {
    return { error: 'אין הרשאה' }
  }
  const parsed = decisionSchema.safeParse({ id, note })
  if (!parsed.success) return { error: 'מזהה לא תקין' }
  const { row, error: loadError } = await loadPending(parsed.data.id)
  if (loadError || !row) return { error: loadError ?? 'הבקשה לא נמצאה.' }
  if (!isSubmissionKind(row.kind)) return { error: 'סוג העלאה לא מוכר בבקשה.' }
  const kind: SubmissionKind = row.kind
  const admin = createAdminClient()

  const { data: blob, error: downloadError } = await admin.storage
    .from(row.storage_bucket)
    .download(row.storage_path)
  if (downloadError || !blob) {
    log.warn('admin.image_submission_download_failed', { reason: downloadError?.message })
    return { error: 'הקובץ הממתין לא נמצא באחסון. הבקשה נשארה פתוחה.' }
  }
  const bytes = Buffer.from(await blob.arrayBuffer())
  let format: string | undefined
  try {
    const meta = await sharp(bytes).metadata()
    format = meta.format
    if (!meta.width || !meta.height) throw new Error('no dimensions')
  } catch (cause) {
    log.warn('admin.image_submission_undecodable', { submissionId: row.id, reason: String(cause) })
    return { error: 'הקובץ אינו תמונה תקינה. דחו את הבקשה.' }
  }
  if (!format || !DECODABLE.has(format)) {
    return { error: `פורמט ${format ?? 'לא ידוע'} אינו נתמך. דחו את הבקשה.` }
  }
  const ext = format === 'jpeg' ? 'jpg' : format

  const ownerId = kind === 'logo' ? row.supplier_id : (row.product_id as string)
  const bucket = PUBLISH_BUCKET[kind]
  const key = publishedObjectPath(kind, ownerId, row.id, ext)
  const { error: uploadError } = await admin.storage.from(bucket).upload(key, bytes, {
    contentType: `image/${format}`,
    upsert: true,
  })
  if (uploadError) {
    log.warn('admin.image_submission_publish_failed', { reason: uploadError.message })
    return { error: 'ההעתקה לדלי הציבורי נכשלה. הבקשה נשארה פתוחה.' }
  }
  const { data: pub } = admin.storage.from(bucket).getPublicUrl(key)
  const url = pub.publicUrl

  if (kind === 'product') {
    const { data: product, error: readError } = await admin
      .from('products')
      .select('id, images')
      .eq('id', ownerId)
      .maybeSingle()
    if (readError || !product) return { error: 'המוצר לא נמצא. הבקשה נשארה פתוחה.' }
    const current = Array.isArray(product.images)
      ? (product.images as unknown[]).filter((v): v is string => typeof v === 'string')
      : []
    const { error: writeError } = await admin
      .from('products')
      .update({ images: [...current, url] } as never)
      .eq('id', ownerId)
    if (writeError) {
      log.warn('admin.image_submission_product_write_failed', { reason: writeError.message })
      return { error: 'צירוף התמונה למוצר נכשל. הבקשה נשארה פתוחה.' }
    }
    updateTag(CATALOGUE_TAG)
  } else {
    const { error: writeError } = await admin
      .from('suppliers')
      .update({ logo_url: url })
      .eq('id', ownerId)
    if (writeError) {
      log.warn('admin.image_submission_logo_write_failed', { reason: writeError.message })
      return { error: 'עדכון הלוגו נכשל. הבקשה נשארה פתוחה.' }
    }
  }

  const markError = await markDecided(row, 'approved', session, parsed.data.note, url)
  if (markError) return { error: 'התמונה פורסמה אך סימון הבקשה נכשל. אשרו שוב כדי לסגור אותה.' }
  await admin.storage.from(row.storage_bucket).remove([row.storage_path])

  await writeAuditLog({
    actorId: session.userId,
    actorRole: 'admin',
    action: 'updated',
    entityType: kind === 'logo' ? 'supplier' : 'product',
    entityId: ownerId,
    changes: kind === 'logo' ? { logo_url: url } : { images: { appended: url } },
    metadata: {
      via: 'supplier_image_submission',
      submission_id: row.id,
      supplier_id: row.supplier_id,
    },
  })
  revalidatePath('/admin/suppliers/image-submissions')
  revalidatePath(kind === 'logo' ? '/supplier/settings' : '/supplier/products')
  return { success: 'התמונה פורסמה.' }
}

async function runRejectImageSubmission(
  id: string,
  note?: string,
): Promise<SubmissionDecisionState> {
  let session: AdminSessionInfo
  try {
    session = await requireAdminSession()
  } catch {
    return { error: 'אין הרשאה' }
  }
  const parsed = decisionSchema.safeParse({ id, note })
  if (!parsed.success) return { error: 'מזהה לא תקין' }
  const { row, error: loadError } = await loadPending(parsed.data.id)
  if (loadError || !row) return { error: loadError ?? 'הבקשה לא נמצאה.' }
  const markError = await markDecided(row, 'rejected', session, parsed.data.note, null)
  if (markError) return { error: 'הדחייה נכשלה.' }
  await createAdminClient().storage.from(row.storage_bucket).remove([row.storage_path])
  await writeAuditLog({
    actorId: session.userId,
    actorRole: 'admin',
    action: 'status_change',
    entityType: 'supplier_image_submission',
    entityId: row.id,
    changes: { status: { from: 'pending', to: 'rejected' } },
    metadata: { supplier_id: row.supplier_id, kind: row.kind },
  })
  revalidatePath('/admin/suppliers/image-submissions')
  revalidatePath(row.kind === 'logo' ? '/supplier/settings' : '/supplier/products')
  return { success: 'הבקשה נדחתה.' }
}

export async function approveImageSubmission(
  id: string,
  note?: string,
): Promise<SubmissionDecisionState> {
  return withActionContext('admin.image_submission.approve', () =>
    runApproveImageSubmission(id, note),
  )
}

export async function rejectImageSubmission(
  id: string,
  note?: string,
): Promise<SubmissionDecisionState> {
  return withActionContext('admin.image_submission.reject', () =>
    runRejectImageSubmission(id, note),
  )
}
