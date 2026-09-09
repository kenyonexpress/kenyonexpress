'use server'

import { writeAuditLog } from '@/lib/admin/audit'
import { type AdminSessionInfo, requireAdminSession } from '@/lib/admin/rbac'
import { CATALOGUE_TAG } from '@/lib/catalogue-cache'
import { withActionContext } from '@/lib/observability/action-context'
import { log } from '@/lib/observability/log'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath, updateTag } from 'next/cache'
import { z } from 'zod'

/**
 * The approval console's writes.
 *
 * APPROVING CREATES THE SUPPLIER. That is the whole reason an application is a
 * separate table: until this action runs there is no `suppliers` row, so an
 * unapproved business cannot appear in the directory, the admin pickers, the
 * publish gate or the payout run - and none of those had to learn about a new
 * status for that to be true.
 *
 * THE ORDER IS SUPPLIER FIRST, THEN THE APPLICATION. The CHECK in 204 refuses
 * an `approved` application whose `supplier_id` is null, so the link cannot be
 * left dangling by a failure between the two statements. The worst case is a
 * supplier row whose application still says `in_review`, which an operator can
 * see and fix; the other order would produce an approval pointing at nothing,
 * which the database refuses outright and which would leave the operator
 * staring at a constraint error with a half-created business.
 */

export type ApplicationActionState = { error: string } | { success: string } | null

const MISSING = new Set(['42P01', 'PGRST205', 'PGRST204', '42703'])
const NOT_APPLIED = 'הטבלאות עדיין לא הוחלו. ראו migrations/pending/204_supplier_onboarding.sql'

function missing(code: string | undefined): boolean {
  return MISSING.has(code ?? '')
}

const decideSchema = z.object({
  id: z.string().uuid(),
  decision: z.enum(['approve', 'reject', 'in_review']),
  note: z.string().trim().max(2000).optional().default(''),
})

async function runDecideApplication(
  _: ApplicationActionState,
  formData: FormData,
): Promise<ApplicationActionState> {
  let session: AdminSessionInfo
  try {
    session = await requireAdminSession()
  } catch {
    return { error: 'אין הרשאה' }
  }

  const parsed = decideSchema.safeParse({
    id: formData.get('id'),
    decision: formData.get('decision'),
    note: formData.get('note') ?? '',
  })
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'קלט לא תקין' }

  const admin = createAdminClient()
  const { data: application, error: readError } = await admin
    .from('supplier_applications')
    .select(
      'id, status, business_name, business_id, contact_name, email, phone, city, address, website',
    )
    .eq('id', parsed.data.id)
    .maybeSingle()
  if (readError) {
    if (missing(readError.code)) return { error: NOT_APPLIED }
    log.error('admin.application_read_failed', { reason: readError.message })
    return { error: 'לא ניתן לטעון את הבקשה' }
  }
  if (!application) return { error: 'הבקשה לא נמצאה' }

  const row = application as unknown as {
    id: string
    status: string
    business_name: string
    business_id: string
    contact_name: string
    email: string
    phone: string
    city: string
    address: string | null
    website: string | null
  }

  if (row.status === 'approved' || row.status === 'rejected') {
    return { error: 'הבקשה כבר הוכרעה' }
  }

  const now = new Date().toISOString()

  if (parsed.data.decision === 'in_review') {
    const { error } = await admin
      .from('supplier_applications')
      .update({ status: 'in_review' } as never)
      .eq('id', row.id)
      .eq('status', 'submitted')
    if (error) {
      if (missing(error.code)) return { error: NOT_APPLIED }
      return { error: 'העדכון נכשל' }
    }
    revalidatePath('/admin/suppliers/applications')
    return { success: 'הבקשה סומנה כבבדיקה' }
  }

  if (parsed.data.decision === 'reject') {
    // The CHECK requires a reason of at least three characters, and it requires
    // one because the applicant is TOLD this text. "No" with no reason is what
    // the second application is made of.
    if (parsed.data.note.trim().length < 3) {
      return { error: 'חובה לנמק דחייה. הנימוק נשלח למבקש.' }
    }
    const { error } = await admin
      .from('supplier_applications')
      .update({
        status: 'rejected',
        reviewed_at: now,
        reviewed_by: session.userId,
        review_note: parsed.data.note,
      } as never)
      .eq('id', row.id)
    if (error) {
      if (missing(error.code)) return { error: NOT_APPLIED }
      log.error('admin.application_reject_failed', { reason: error.message })
      return { error: 'הדחייה לא נשמרה' }
    }

    await writeAuditLog({
      actorId: session.userId,
      actorRole: session.role,
      action: 'status_change',
      entityType: 'supplier_application',
      entityId: row.id,
      metadata: { decision: 'rejected', note: parsed.data.note },
    })
    revalidatePath('/admin/suppliers/applications')
    return { success: 'הבקשה נדחתה והנימוק נשמר' }
  }

  // ── Approve ──────────────────────────────────────────────────────────────
  //
  // `status: 'active'` and not a pending value: `supplier_status` is
  // `active, suspended, closed` and this file deliberately does not extend it
  // (see 204). A supplier exists only once somebody has said yes.
  const { data: supplier, error: supplierError } = await admin
    .from('suppliers')
    .insert({
      name: row.business_name,
      business_id: row.business_id,
      contact_name: row.contact_name,
      contact_email: row.email,
      contact_phone: row.phone,
      city: row.city,
      address: row.address,
      website: row.website,
      status: 'active',
    } as never)
    .select('id')
    .single()

  if (supplierError || !supplier) {
    if (missing(supplierError?.code)) return { error: NOT_APPLIED }
    log.error('admin.supplier_create_failed', {
      applicationId: row.id,
      reason: supplierError?.message,
    })
    return { error: 'יצירת הספק נכשלה. הבקשה נשארה פתוחה.' }
  }

  const supplierId = (supplier as { id: string }).id
  const { error: linkError } = await admin
    .from('supplier_applications')
    .update({
      status: 'approved',
      reviewed_at: now,
      reviewed_by: session.userId,
      review_note: parsed.data.note || null,
      supplier_id: supplierId,
    } as never)
    .eq('id', row.id)

  if (linkError) {
    // The supplier EXISTS. Saying so is the only useful message: an operator
    // who is told "approval failed" would click again and create a second one.
    log.error('admin.application_link_failed', {
      applicationId: row.id,
      supplierId,
      reason: linkError.message,
    })
    return {
      error: `הספק נוצר (${supplierId.slice(0, 8)}) אך הבקשה לא סומנה כמאושרת. אל תאשרו שוב, עדכנו ידנית.`,
    }
  }

  await writeAuditLog({
    actorId: session.userId,
    actorRole: session.role,
    action: 'created',
    entityType: 'supplier',
    entityId: supplierId,
    metadata: { from_application: row.id, business_id: row.business_id },
  })

  revalidatePath('/admin/suppliers/applications')
  revalidatePath('/admin/suppliers')
  // A new supplier is a new name, city and logo on the public storefront, and
  // the directory is cached. Without this the business is approved and stays
  // invisible until something else happens to invalidate the catalogue.
  updateTag(CATALOGUE_TAG)
  return { success: 'הבקשה אושרה והספק נוצר' }
}

const suspendSchema = z.object({
  supplier_id: z.string().uuid(),
  status: z.enum(['active', 'suspended', 'closed']),
  reason: z.string().trim().min(3, 'חובה לנמק').max(2000),
})

async function runSetSupplierStatus(
  _: ApplicationActionState,
  formData: FormData,
): Promise<ApplicationActionState> {
  let session: AdminSessionInfo
  try {
    session = await requireAdminSession()
  } catch {
    return { error: 'אין הרשאה' }
  }

  const parsed = suspendSchema.safeParse({
    supplier_id: formData.get('supplier_id'),
    status: formData.get('status'),
    reason: formData.get('reason'),
  })
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'קלט לא תקין' }

  const admin = createAdminClient()
  const { error } = await admin
    .from('suppliers')
    .update({ status: parsed.data.status } as never)
    .eq('id', parsed.data.supplier_id)
  if (error) {
    log.error('admin.supplier_status_failed', { reason: error.message })
    return { error: 'העדכון נכשל' }
  }

  await writeAuditLog({
    actorId: session.userId,
    actorRole: session.role,
    action: 'status_change',
    entityType: 'supplier',
    entityId: parsed.data.supplier_id,
    metadata: { status: parsed.data.status, reason: parsed.data.reason },
  })

  revalidatePath('/admin/suppliers')
  // Suspending removes a business from the storefront. Cached, so it stays
  // visible and bookable until the catalogue is invalidated - which on a
  // suspension is the whole point of the action.
  updateTag(CATALOGUE_TAG)
  return {
    success:
      parsed.data.status === 'suspended'
        ? 'הספק הושעה. שוברים שכבר נמכרו ממשיכים להיות ניתנים למימוש.'
        : 'סטטוס הספק עודכן',
  }
}

export async function decideSupplierApplication(
  prev: ApplicationActionState,
  formData: FormData,
): Promise<ApplicationActionState> {
  return withActionContext('admin.supplier_application_decide', () =>
    runDecideApplication(prev, formData),
  )
}

export async function setSupplierStatus(
  prev: ApplicationActionState,
  formData: FormData,
): Promise<ApplicationActionState> {
  return withActionContext('admin.supplier_status', () => runSetSupplierStatus(prev, formData))
}
