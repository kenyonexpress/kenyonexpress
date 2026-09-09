'use server'

import { writeAuditLog } from '@/lib/admin/audit'
import { withActionContext } from '@/lib/observability/action-context'
import { log } from '@/lib/observability/log'
import { createClient } from '@/lib/supabase/server'
import {
  CONTACT_FIELD_LABEL_HE,
  MAX_NOTE_LENGTH,
  isContactField,
  isSameValue,
  validateContactValue,
} from '@/lib/supplier/contact-fields'
import { requireSupplierRole } from '@/lib/supplier/rbac'
import { revalidatePath } from 'next/cache'

/**
 * A supplier asking for one of their contact details to be changed.
 *
 * WRITTEN THROUGH THE REQUEST-SCOPED CLIENT, for the reason `supplier/reviews.ts`
 * gives: 225's INSERT policy proves ownership in SQL (`is_supplier_owner`) and
 * pins `requested_by` to `auth.uid()`, and both are enforced by the database
 * only when the caller is the user's own role. The service role would bypass
 * them and leave "is this really their supplier" as a TypeScript condition.
 *
 * THE TABLE MAY NOT EXIST YET. 225 sits in `migrations/pending/` and is not
 * applied. An unapplied migration must not turn this form into a 500 -- the
 * lesson from the abandoned-cart mailer, which called a function signature that
 * was not in production and answered 500 on every run for weeks. The two codes
 * that mean "not applied" are handled explicitly and answered in Hebrew.
 */

/** PostgREST's schema-cache miss, and Postgres' undefined_table. */
const TABLE_ABSENT = new Set(['PGRST205', 'PGRST106', '42P01'])
/** The partial unique index in 225: one pending request per field. */
const UNIQUE_VIOLATION = '23505'

export type ContactRequestState = { ok: boolean; message?: string; error?: string }

async function runRequestContactChange(
  field: string,
  requestedValue: string,
  note: string,
): Promise<ContactRequestState> {
  // Owner, not manager. The value lands on the row that payout correspondence
  // is addressed to, and 225's INSERT policy is `is_supplier_owner` -- a
  // manager reaching here would be refused by the policy anyway, and being
  // refused by a gate that can say why in Hebrew beats being refused by RLS
  // with zero rows and no explanation.
  const session = await requireSupplierRole('owner', '/supplier/settings')

  if (!isContactField(field)) return { ok: false, error: 'שדה לא מוכר.' }

  const validated = validateContactValue(field, requestedValue)
  if (!validated.ok) return { ok: false, error: validated.error }

  const trimmedNote = note.trim()
  if (trimmedNote.length > MAX_NOTE_LENGTH) {
    return { ok: false, error: `ההערה ארוכה מדי (עד ${MAX_NOTE_LENGTH} תווים).` }
  }

  const supabase = await createClient()

  // The current value is read through the SAME user-scoped client, so a
  // supplier can only snapshot a row they can already see. It is stored on the
  // request so that an admin deciding a week later reads the change against
  // what it was actually changing, rather than against whatever the column
  // holds by then.
  const { data: supplier, error: readError } = await supabase
    .from('suppliers')
    .select('contact_name, contact_email, contact_phone, whatsapp, address, city, website')
    .eq('id', session.supplierId)
    .maybeSingle()

  if (readError) {
    log.warn('supplier.contact_request_current_read_failed', { reason: readError.message })
    return { ok: false, error: 'לא הצלחנו לטעון את הפרטים הנוכחיים. נסו שוב.' }
  }

  const current = (supplier as Record<string, string | null> | null)?.[field] ?? null
  if (isSameValue(current, validated.value)) {
    // Not an error, and not a row. Filing a request that changes nothing puts
    // an item in the admin queue whose approval is a no-op, and the one pending
    // request per field is then spent on it.
    return { ok: false, error: 'הערך זהה למה שמופיע כרגע.' }
  }

  const { error } = await supabase.from('supplier_contact_requests' as never).insert({
    supplier_id: session.supplierId,
    field,
    current_value: current,
    requested_value: validated.value,
    note: trimmedNote || null,
    requested_by: session.userId,
    status: 'pending',
  } as never)

  if (error) {
    if (TABLE_ABSENT.has(error.code ?? '')) {
      log.warn('supplier.contact_request_table_absent', { code: error.code })
      return { ok: false, error: 'בקשות עדכון פרטים עדיין לא זמינות.' }
    }
    if (error.code === UNIQUE_VIOLATION) {
      return {
        ok: false,
        error: `כבר קיימת בקשה פתוחה עבור ${CONTACT_FIELD_LABEL_HE[field]}. בטלו אותה כדי להגיש חדשה.`,
      }
    }
    log.warn('supplier.contact_request_failed', { reason: error.message })
    return { ok: false, error: 'השמירה נכשלה.' }
  }

  await writeAuditLog({
    actorId: session.userId,
    actorRole: 'vendor',
    action: 'created',
    entityType: 'supplier_contact_request',
    entityId: session.supplierId,
    changes: { field, requested_value: validated.value.slice(0, 200) },
    metadata: { via: 'supplier_portal', supplier_id: session.supplierId },
  })

  revalidatePath('/supplier/settings')
  return { ok: true, message: 'הבקשה נשלחה ותיבדק על ידינו.' }
}

/**
 * Taking back a pending request.
 *
 * An UPDATE to `withdrawn`, never a DELETE: 225 grants no DELETE and defines no
 * DELETE policy, because the history of who asked for what is the reason the
 * table exists. `.eq('status', 'pending')` restates the policy's USING clause
 * so that withdrawing an already-decided request is zero rows here rather than
 * a silent no-op that reports success.
 */
async function runWithdrawContactRequest(requestId: string): Promise<ContactRequestState> {
  const session = await requireSupplierRole('owner', '/supplier/settings')
  if (!/^[0-9a-f-]{36}$/i.test(requestId)) return { ok: false, error: 'בקשה לא תקינה.' }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('supplier_contact_requests' as never)
    .update({ status: 'withdrawn' } as never)
    .eq('id', requestId)
    .eq('status', 'pending')
    .select('id')
    .maybeSingle()

  if (error) {
    if (TABLE_ABSENT.has(error.code ?? '')) {
      return { ok: false, error: 'בקשות עדכון פרטים עדיין לא זמינות.' }
    }
    log.warn('supplier.contact_request_withdraw_failed', { reason: error.message })
    return { ok: false, error: 'הביטול נכשל.' }
  }

  // Zero rows is the policy refusing, or the request already being decided.
  // Answered the same way for both, the reason `supplier/reviews.ts` gives:
  // distinguishing them confirms an id exists to somebody who guessed it.
  if (!data) return { ok: false, error: 'הבקשה לא נמצאה.' }

  await writeAuditLog({
    actorId: session.userId,
    actorRole: 'vendor',
    action: 'updated',
    entityType: 'supplier_contact_request',
    entityId: requestId,
    changes: { status: 'withdrawn' },
    metadata: { via: 'supplier_portal', supplier_id: session.supplierId },
  })

  revalidatePath('/supplier/settings')
  return { ok: true, message: 'הבקשה בוטלה.' }
}

export async function requestContactChange(
  field: string,
  requestedValue: string,
  note: string,
): Promise<ContactRequestState> {
  return withActionContext('supplier.contact.request', () =>
    runRequestContactChange(field, requestedValue, note),
  )
}

export async function withdrawContactRequest(requestId: string): Promise<ContactRequestState> {
  return withActionContext('supplier.contact.withdraw', () => runWithdrawContactRequest(requestId))
}
