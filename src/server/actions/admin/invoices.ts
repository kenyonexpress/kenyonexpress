'use server'

import { writeAuditLog } from '@/lib/admin/audit'
import { canRequeueInvoice } from '@/lib/admin/invoices'
import { type AdminSessionInfo, requireSection } from '@/lib/admin/rbac'
import { withActionContext } from '@/lib/observability/action-context'
import { log } from '@/lib/observability/log'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

/**
 * "Reissue" for a document the provider never produced: put the row back at
 * the front of the invoice cron's queue with its attempts reset. An issued
 * document is never re-requested (see canRequeueInvoice); its link is the
 * reissue.
 */

export type InvoiceActionState = { error: string } | { success: string } | null

async function guard(): Promise<AdminSessionInfo | null> {
  try {
    return await requireSection('payments', 'write')
  } catch {
    return null
  }
}

async function runRequeueInvoice(id: string): Promise<InvoiceActionState> {
  const session = await guard()
  if (!session) return { error: 'אין הרשאה' }
  if (!z.string().uuid().safeParse(id).success) return { error: 'מזהה לא תקין' }
  const admin = createAdminClient()
  const { data: row, error: readError } = await admin
    .from('invoices')
    .select('id, status, attempts, order_id')
    .eq('id', id)
    .maybeSingle()
  if (readError) {
    log.warn('admin.invoice_requeue_read_failed', { reason: readError.message })
    return { error: 'קריאת החשבונית נכשלה.' }
  }
  if (!row) return { error: 'החשבונית לא נמצאה.' }
  if (!canRequeueInvoice(row.status)) {
    return { error: 'מסמך שהונפק אינו מונפק שוב; הקישור שלו הוא המסמך.' }
  }
  const { error } = await admin
    .from('invoices')
    .update({
      status: 'pending',
      attempts: 0,
      last_error: null,
      next_attempt_at: new Date().toISOString(),
    } as never)
    .eq('id', row.id)
  if (error) {
    log.warn('admin.invoice_requeue_failed', { reason: error.message })
    return { error: 'ההחזרה לתור נכשלה.' }
  }
  await writeAuditLog({
    actorId: session.userId,
    actorRole: 'admin',
    action: 'status_change',
    entityType: 'invoice',
    entityId: row.id,
    changes: {
      status: { from: row.status, to: 'pending' },
      attempts: { from: row.attempts, to: 0 },
    },
    metadata: { order_id: row.order_id },
  })
  revalidatePath('/admin/invoices')
  return { success: 'החשבונית חזרה לתור ותונפק בריצה הבאה.' }
}

export async function requeueInvoice(id: string): Promise<InvoiceActionState> {
  return withActionContext('admin.invoice.requeue', () => runRequeueInvoice(id))
}
