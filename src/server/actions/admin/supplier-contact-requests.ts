'use server'

import { writeAuditLog } from '@/lib/admin/audit'
import { type AdminSessionInfo, requireAdminSession } from '@/lib/admin/rbac'
import { CATALOGUE_TAG } from '@/lib/catalogue-cache'
import { withActionContext } from '@/lib/observability/action-context'
import { log } from '@/lib/observability/log'
import { createAdminClient } from '@/lib/supabase/admin'
import { isContactField, validateContactValue } from '@/lib/supplier/contact-fields'
import { revalidatePath, updateTag } from 'next/cache'
import { z } from 'zod'

/**
 * The admin half of section 28's "contact details edit request form (admin
 * approves)".
 *
 * SERVICE ROLE HERE, USER ROLE ON THE SUPPLIER SIDE, and the asymmetry is the
 * design. 225 deliberately gives `authenticated` no UPDATE path out of
 * `pending`, so approving cannot be done with a user's own JWT at all -- which
 * is what makes a self-approved request impossible rather than merely
 * disallowed. The admin identity is proven before the client is created, by
 * `requireAdminSession`.
 *
 * ORDER OF WRITES IS LOAD-BEARING, and 225's header says why: `suppliers` is
 * written FIRST, then the request is marked approved. A crash between the two
 * leaves a pending request whose value is already live, and re-approving writes
 * the same value again -- idempotent. The other order marks the request decided
 * and loses the change, reporting success for a thing that did not happen.
 */

/** PostgREST's schema-cache miss, and Postgres' undefined_table. 225 is pending. */
const TABLE_ABSENT = new Set(['PGRST205', 'PGRST106', '42P01'])

const decisionSchema = z.object({
  id: z.string().uuid(),
  note: z.string().max(1000).optional(),
})

export type ContactDecisionState = { error: string } | { success: string } | null

type RequestRow = {
  id: string
  supplier_id: string
  field: string
  current_value: string | null
  requested_value: string
  status: string
}

async function loadPending(id: string): Promise<{ row?: RequestRow; error?: string }> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('supplier_contact_requests' as never)
    .select('id, supplier_id, field, current_value, requested_value, status')
    .eq('id', id)
    .maybeSingle()

  if (error) {
    if (TABLE_ABSENT.has(error.code ?? '')) return { error: 'בקשות עדכון פרטים עדיין לא זמינות.' }
    log.warn('admin.contact_request_read_failed', { reason: error.message })
    return { error: 'קריאת הבקשה נכשלה.' }
  }

  const row = data as RequestRow | null
  if (!row) return { error: 'הבקשה לא נמצאה.' }
  // Re-checked at decision time rather than trusted from the list the admin was
  // looking at. Two admins with the queue open in two tabs is the ordinary case,
  // and without this the second click re-applies a decision already made.
  if (row.status !== 'pending') return { error: 'הבקשה כבר טופלה.' }
  return { row }
}

async function runApproveContactRequest(id: string, note?: string): Promise<ContactDecisionState> {
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

  // THE STORED VALUE IS RE-VALIDATED BEFORE IT IS APPLIED. It passed
  // `validateContactValue` when it was filed, but 225's UPDATE policy lets an
  // owner edit a request that is still pending, so the value written here is
  // not necessarily the value that was checked. Re-running the same function is
  // cheap and closes the window; the field allowlist is re-checked with it,
  // because `field` is about to become a column name.
  if (!isContactField(row.field)) {
    log.error('admin.contact_request_bad_field', { requestId: row.id, field: row.field })
    return { error: 'שדה לא מוכר בבקשה.' }
  }
  const validated = validateContactValue(row.field, row.requested_value)
  if (!validated.ok) return { error: `הערך בבקשה אינו תקין: ${validated.error}` }

  const admin = createAdminClient()

  // The supplier row first. See the header.
  const { error: applyError } = await admin
    .from('suppliers')
    .update({ [row.field]: validated.value })
    .eq('id', row.supplier_id)

  if (applyError) {
    log.warn('admin.contact_request_apply_failed', { reason: applyError.message })
    return { error: 'עדכון פרטי הספק נכשל. הבקשה נשארה פתוחה.' }
  }

  const { error: markError } = await admin
    .from('supplier_contact_requests' as never)
    .update({
      status: 'approved',
      decided_by: session.userId,
      decided_at: new Date().toISOString(),
      decision_note: parsed.data.note?.trim() || null,
    } as never)
    .eq('id', row.id)

  if (markError) {
    // The value IS live at this point. Saying "failed" would be false and would
    // invite an admin to change it back by hand; saying nothing would leave a
    // pending row an admin thinks is decided. Both facts, in one sentence.
    log.error('admin.contact_request_mark_failed', {
      requestId: row.id,
      reason: markError.message,
    })
    return { error: 'הפרטים עודכנו אך סימון הבקשה נכשל. אשרו שוב כדי לסגור אותה.' }
  }

  await writeAuditLog({
    actorId: session.userId,
    actorRole: 'admin',
    action: 'updated',
    entityType: 'supplier',
    entityId: row.supplier_id,
    changes: { [row.field]: { from: row.current_value, to: validated.value } },
    metadata: { via: 'contact_request', request_id: row.id, decision: 'approved' },
  })

  // THE STOREFRONT SHOWS THESE COLUMNS. `buildSupplierContact` renders the
  // address, the phone, the Waze link and the WhatsApp link on every product
  // page and on the voucher page, and that read is cached under CATALOGUE_TAG
  // for an hour. Without this, an approved phone correction is live in the
  // database and the old number keeps being handed to customers standing at
  // the till -- and the admin, seeing the panel update at once, has no way to
  // tell. `updateTag` rather than `revalidateTag`, for the reason
  // catalogue-cache.ts gives: it expires the entry now.
  updateTag(CATALOGUE_TAG)
  revalidatePath('/admin/suppliers/contact-requests')
  revalidatePath(`/admin/suppliers/${row.supplier_id}`)
  return { success: 'הבקשה אושרה והפרטים עודכנו.' }
}

async function runRejectContactRequest(id: string, note: string): Promise<ContactDecisionState> {
  let session: AdminSessionInfo
  try {
    session = await requireAdminSession()
  } catch {
    return { error: 'אין הרשאה' }
  }

  const parsed = decisionSchema.safeParse({ id, note })
  // A rejection with no reason is a decision the supplier cannot act on: they
  // see the request closed and have no idea what to file instead.
  if (!parsed.success || !parsed.data.note || parsed.data.note.trim().length < 2) {
    return { error: 'נדרשת סיבת דחייה' }
  }

  const { row, error: loadError } = await loadPending(parsed.data.id)
  if (loadError || !row) return { error: loadError ?? 'הבקשה לא נמצאה.' }

  const admin = createAdminClient()
  const { error } = await admin
    .from('supplier_contact_requests' as never)
    .update({
      status: 'rejected',
      decided_by: session.userId,
      decided_at: new Date().toISOString(),
      decision_note: parsed.data.note.trim(),
    } as never)
    .eq('id', row.id)

  if (error) {
    log.warn('admin.contact_request_reject_failed', { reason: error.message })
    return { error: 'הדחייה נכשלה.' }
  }

  await writeAuditLog({
    actorId: session.userId,
    actorRole: 'admin',
    action: 'updated',
    entityType: 'supplier_contact_request',
    entityId: row.id,
    changes: { status: 'rejected' },
    metadata: {
      via: 'contact_request',
      supplier_id: row.supplier_id,
      field: row.field,
      decision: 'rejected',
    },
  })

  revalidatePath('/admin/suppliers/contact-requests')
  return { success: 'הבקשה נדחתה.' }
}

export async function approveContactRequest(
  id: string,
  note?: string,
): Promise<ContactDecisionState> {
  return withActionContext('admin.contact_request.approve', () =>
    runApproveContactRequest(id, note),
  )
}

export async function rejectContactRequest(
  id: string,
  note: string,
): Promise<ContactDecisionState> {
  return withActionContext('admin.contact_request.reject', () => runRejectContactRequest(id, note))
}
