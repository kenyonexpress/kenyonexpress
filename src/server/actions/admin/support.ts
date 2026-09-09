'use server'

import { writeAuditLog } from '@/lib/admin/audit'
import { type AdminSessionInfo, requireAdminSession } from '@/lib/admin/rbac'
import { withActionContext } from '@/lib/observability/action-context'
import { log } from '@/lib/observability/log'
import { createAdminClient } from '@/lib/supabase/admin'
import type { TicketStatus } from '@/server/domain/support/sla'
import { applyMessage, closedAtFor, operatorMayMove } from '@/server/domain/support/tickets'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

/**
 * The operator's side of a ticket.
 *
 * `requireAdminSession` and NOT a section check, because support is a role that
 * this console is for: `SUPPORT_ACCESS` gives it read on orders and users, and
 * the ticket console is the one place it must also WRITE. The guard is
 * therefore the session plus the role's own read of orders, and the audit row
 * is what makes that accountable.
 *
 * AN INTERNAL NOTE IS NOT AN ANSWER. `applyMessage` refuses to let one stop the
 * first-response clock or move the status, which is the difference between an
 * SLA report that measures the desk and one that measures how often somebody
 * typed into a box.
 */

export type SupportActionState = { error: string } | { success: string } | null

const MISSING = new Set(['42P01', 'PGRST205', 'PGRST204', '42703'])
const NOT_APPLIED = 'הטבלאות עדיין לא עודכנו. ראו migrations/pending/203_support_center.sql'

function missing(code: string | undefined): boolean {
  return MISSING.has(code ?? '')
}

const replySchema = z.object({
  ticket_id: z.string().uuid(),
  body: z.string().trim().min(2, 'ההודעה קצרה מדי').max(4000, 'ההודעה ארוכה מדי'),
  direction: z.enum(['outbound', 'internal']),
})

async function runReplyAsStaff(
  _: SupportActionState,
  formData: FormData,
): Promise<SupportActionState> {
  let session: AdminSessionInfo
  try {
    session = await requireAdminSession()
  } catch {
    return { error: 'אין הרשאה' }
  }

  const parsed = replySchema.safeParse({
    ticket_id: formData.get('ticket_id'),
    body: formData.get('body'),
    direction: formData.get('direction'),
  })
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'קלט לא תקין' }

  const admin = createAdminClient()
  const { data: ticket, error: readError } = await admin
    .from('support_tickets')
    .select('id, status, first_response_at')
    .eq('id', parsed.data.ticket_id)
    .maybeSingle()
  if (readError) {
    if (missing(readError.code)) return { error: NOT_APPLIED }
    log.error('admin.support_ticket_read_failed', { reason: readError.message })
    return { error: 'לא ניתן לטעון את הפנייה' }
  }
  if (!ticket) return { error: 'הפנייה לא נמצאה' }

  const row = ticket as unknown as {
    id: string
    status: TicketStatus
    first_response_at: string | null
  }

  const now = new Date()
  const { error: messageError } = await admin.from('support_ticket_messages').insert({
    ticket_id: row.id,
    direction: parsed.data.direction,
    body: parsed.data.body,
    author_id: session.userId,
  } as never)
  if (messageError) {
    if (missing(messageError.code)) return { error: NOT_APPLIED }
    log.error('admin.support_message_failed', { ticketId: row.id, reason: messageError.message })
    return { error: 'שליחת ההודעה נכשלה' }
  }

  const transition = applyMessage({
    currentStatus: row.status,
    direction: parsed.data.direction,
    hasFirstResponse: row.first_response_at !== null,
    at: now,
  })

  // An internal note leaves every one of these undefined, so the patch is
  // empty apart from the status it did not change - skipped entirely rather
  // than written as a no-op UPDATE that bumps `updated_at` and makes the ticket
  // look freshly touched in a queue sorted by it.
  if (parsed.data.direction !== 'internal') {
    const patch: Record<string, unknown> = { status: transition.status }
    if (transition.closedAt !== undefined) patch.closed_at = transition.closedAt
    if (transition.firstResponseAt !== undefined) {
      patch.first_response_at = transition.firstResponseAt
    }
    const { error: updateError } = await admin
      .from('support_tickets')
      .update(patch as never)
      .eq('id', row.id)
    if (updateError) {
      log.warn('admin.support_ticket_update_failed', {
        ticketId: row.id,
        reason: updateError.message,
      })
    }
  }

  await writeAuditLog({
    actorId: session.userId,
    actorRole: session.role,
    action: 'updated',
    entityType: 'support_ticket',
    entityId: row.id,
    metadata: { direction: parsed.data.direction },
  })

  revalidatePath('/admin/support')
  return {
    success: parsed.data.direction === 'internal' ? 'ההערה הפנימית נשמרה' : 'התשובה נשלחה',
  }
}

const updateSchema = z.object({
  ticket_id: z.string().uuid(),
  status: z.enum(['open', 'pending', 'waiting_customer', 'resolved', 'closed']).optional(),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
  assign_to_me: z.string().optional(),
})

async function runUpdateTicket(
  _: SupportActionState,
  formData: FormData,
): Promise<SupportActionState> {
  let session: AdminSessionInfo
  try {
    session = await requireAdminSession()
  } catch {
    return { error: 'אין הרשאה' }
  }

  const parsed = updateSchema.safeParse({
    ticket_id: formData.get('ticket_id'),
    status: formData.get('status') || undefined,
    priority: formData.get('priority') || undefined,
    assign_to_me: formData.get('assign_to_me') || undefined,
  })
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'קלט לא תקין' }

  const admin = createAdminClient()
  const { data: ticket, error: readError } = await admin
    .from('support_tickets')
    .select('id, status')
    .eq('id', parsed.data.ticket_id)
    .maybeSingle()
  if (readError) {
    if (missing(readError.code)) return { error: NOT_APPLIED }
    return { error: 'לא ניתן לטעון את הפנייה' }
  }
  if (!ticket) return { error: 'הפנייה לא נמצאה' }
  const current = (ticket as unknown as { status: TicketStatus }).status

  const patch: Record<string, unknown> = {}
  if (parsed.data.status) {
    // Checked here rather than left to the database, because the CHECK only
    // knows the set of legal values and not which move makes sense from where.
    // A `resolved -> waiting_customer` with no message is a ticket claiming it
    // is waiting on a customer nobody wrote to.
    if (!operatorMayMove(current, parsed.data.status)) {
      return { error: `לא ניתן להעביר פנייה מ-${current} ל-${parsed.data.status}` }
    }
    patch.status = parsed.data.status
    // Always written alongside the status: 203 refuses `closed` without a time
    // and a time without `closed`, so the two cannot be set separately.
    patch.closed_at = closedAtFor(parsed.data.status, new Date())
  }
  if (parsed.data.priority) patch.priority = parsed.data.priority
  if (parsed.data.assign_to_me === 'on') patch.assigned_to = session.userId

  if (Object.keys(patch).length === 0) return { error: 'לא נבחר שינוי' }

  const { error: updateError } = await admin
    .from('support_tickets')
    .update(patch as never)
    .eq('id', parsed.data.ticket_id)
  if (updateError) {
    if (missing(updateError.code)) return { error: NOT_APPLIED }
    log.error('admin.support_update_failed', { reason: updateError.message })
    return { error: 'העדכון נכשל' }
  }

  await writeAuditLog({
    actorId: session.userId,
    actorRole: session.role,
    action: 'status_change',
    entityType: 'support_ticket',
    entityId: parsed.data.ticket_id,
    changes: patch as never,
  })

  revalidatePath('/admin/support')
  return { success: 'הפנייה עודכנה' }
}

export async function replyAsStaff(
  prev: SupportActionState,
  formData: FormData,
): Promise<SupportActionState> {
  return withActionContext('admin.support_reply', () => runReplyAsStaff(prev, formData))
}

export async function updateTicket(
  prev: SupportActionState,
  formData: FormData,
): Promise<SupportActionState> {
  return withActionContext('admin.support_update', () => runUpdateTicket(prev, formData))
}
