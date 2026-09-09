'use server'

import { withActionContext } from '@/lib/observability/action-context'
import { log } from '@/lib/observability/log'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { checkRateLimit } from '@/lib/utils/rate-limit'
import { type TicketStatus, suggestedPriority } from '@/server/domain/support/sla'
import { applyMessage } from '@/server/domain/support/tickets'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

/**
 * The customer's side of support: opening a ticket and replying to one.
 *
 * EVERY WRITE IS ON THE SERVICE-ROLE CLIENT, and 203 grants no INSERT to any
 * client role on either table. A policy can say "this row is yours"; it cannot
 * check that the order being asked about belongs to the caller, that the
 * ticket exists, or that this is not the fortieth message this hour. Those
 * checks are the reason this file exists, and moving them into RLS would mean
 * losing them.
 *
 * A TICKET MUST BE ANSWERABLE. 203 adds a CHECK requiring `user_id`, `email` or
 * `phone`, because the table could previously hold a `contact_form` ticket with
 * none of the three - a message from somebody we have no way to reply to. Each
 * entry point here supplies whichever one it has.
 */

const MISSING_TABLE = new Set(['42P01', 'PGRST205', 'PGRST204'])
const UNDEFINED_COLUMN = '42703'

const NOT_APPLIED_MESSAGE = 'מרכז הפניות עדיין לא פעיל. כתבו לנו במייל ונטפל בזה.'

function notApplied(code: string | undefined): boolean {
  return MISSING_TABLE.has(code ?? '') || code === UNDEFINED_COLUMN
}

export type SupportState = { ok: boolean; message?: string; error?: string; ticketId?: string }

// ── Opening a ticket about an order ────────────────────────────────────────

const orderHelpSchema = z.object({
  order_id: z.string().uuid(),
  category: z.enum(['order_status', 'voucher_problem', 'refund', 'payment', 'other']),
  body: z.string().trim().min(10, 'נא לפרט לפחות 10 תווים').max(4000, 'ההודעה ארוכה מדי'),
})

async function runOpenOrderTicket(_prev: SupportState, formData: FormData): Promise<SupportState> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'יש להתחבר כדי לפתוח פנייה' }

  const parsed = orderHelpSchema.safeParse({
    order_id: formData.get('order_id'),
    category: formData.get('category'),
    body: formData.get('body'),
  })
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'בדקו את הפרטים ונסו שוב' }
  }

  if (!(await checkRateLimit(`support-open:${user.id}`, 10, 3600))) {
    return { ok: false, error: 'יותר מדי פניות. נסו שוב מאוחר יותר.' }
  }

  const admin = createAdminClient()

  // Ownership, on the client that does not consult RLS. Same sentence for "not
  // found" and "not yours", so a different message cannot confirm an order id.
  const { data: order, error: orderError } = await admin
    .from('orders')
    .select('id, user_id')
    .eq('id', parsed.data.order_id)
    .maybeSingle()
  if (orderError) {
    log.error('support.order_read_failed', { userId: user.id, reason: orderError.message })
    return { ok: false, error: 'לא ניתן לטעון את ההזמנה כרגע, נסו שוב' }
  }
  if (!order || order.user_id !== user.id) return { ok: false, error: 'ההזמנה לא נמצאה' }

  /**
   * ONE OPEN TICKET PER ORDER, and this is not a cap like the refund one - it
   * is deduplication. Three tickets about the same order are three operators
   * reading the same history and answering in three places; a customer with
   * more to say should be adding to the conversation they already started. So
   * a second attempt lands as a MESSAGE on the existing ticket rather than
   * being refused, which is what the customer meant either way.
   */
  const { data: existing, error: existingError } = await admin
    .from('support_tickets')
    .select('id, status')
    .eq('order_id', parsed.data.order_id)
    .not('status', 'in', '("closed")')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (existingError) {
    if (notApplied(existingError.code)) return { ok: false, error: NOT_APPLIED_MESSAGE }
    // A read that FAILED is not "no open ticket". Swallowed, it would open a
    // SECOND ticket on an order that already has one, which is the exact
    // duplication the lookup exists to prevent - and the customer would then
    // hold two threads and get two answers.
    log.error('support.existing_ticket_read_failed', {
      orderId: parsed.data.order_id,
      reason: existingError.message,
    })
    return { ok: false, error: 'לא ניתן לבדוק פניות קיימות כרגע, נסו שוב' }
  }

  if (existing) {
    const ticket = existing as unknown as { id: string; status: TicketStatus }
    const posted = await postMessage(admin, {
      ticketId: ticket.id,
      currentStatus: ticket.status,
      direction: 'inbound',
      body: parsed.data.body,
      authorId: user.id,
    })
    if (!posted.ok) return { ok: false, error: posted.error }
    revalidatePath(`/account/tickets/${ticket.id}`)
    return {
      ok: true,
      ticketId: ticket.id,
      message: 'ההודעה נוספה לפנייה הפתוחה על ההזמנה הזו.',
    }
  }

  const email = user.email ?? null
  const { data: created, error: createError } = await admin
    .from('support_tickets')
    .insert({
      user_id: user.id,
      email,
      order_id: parsed.data.order_id,
      channel: 'order_help',
      category: parsed.data.category,
      priority: suggestedPriority({ channel: 'order_help', category: parsed.data.category }),
      subject: `עזרה בהזמנה ${parsed.data.order_id.slice(0, 8)}`,
      last_customer_message_at: new Date().toISOString(),
    } as never)
    .select('id')
    .single()

  if (createError || !created) {
    if (notApplied(createError?.code)) {
      log.error('support.tables_not_applied', { code: createError?.code })
      return { ok: false, error: NOT_APPLIED_MESSAGE }
    }
    log.error('support.ticket_create_failed', { reason: createError?.message })
    return { ok: false, error: 'פתיחת הפנייה נכשלה, נסו שוב' }
  }

  const ticketId = (created as { id: string }).id
  const posted = await postMessage(admin, {
    ticketId,
    currentStatus: 'open',
    direction: 'inbound',
    body: parsed.data.body,
    authorId: user.id,
  })
  if (!posted.ok) return { ok: false, error: posted.error }

  revalidatePath('/account/tickets')
  return { ok: true, ticketId, message: 'הפנייה נפתחה. נחזור אליכם בהקדם.' }
}

// ── Replying to a ticket ───────────────────────────────────────────────────

const replySchema = z.object({
  ticket_id: z.string().uuid(),
  body: z.string().trim().min(2, 'ההודעה קצרה מדי').max(4000, 'ההודעה ארוכה מדי'),
})

async function runReplyToTicket(_prev: SupportState, formData: FormData): Promise<SupportState> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'יש להתחבר' }

  const parsed = replySchema.safeParse({
    ticket_id: formData.get('ticket_id'),
    body: formData.get('body'),
  })
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'בדקו את ההודעה' }
  }

  // The bound on a reopened-forever ticket is here, not on the status: see
  // `customerMayReply`. Thirty an hour is a conversation, not a flood.
  if (!(await checkRateLimit(`support-reply:${user.id}`, 30, 3600))) {
    return { ok: false, error: 'יותר מדי הודעות. נסו שוב מאוחר יותר.' }
  }

  const admin = createAdminClient()
  const { data: ticket, error: ticketError } = await admin
    .from('support_tickets')
    .select('id, user_id, status')
    .eq('id', parsed.data.ticket_id)
    .maybeSingle()
  if (ticketError) {
    if (notApplied(ticketError.code)) return { ok: false, error: NOT_APPLIED_MESSAGE }
    log.error('support.ticket_read_failed', { reason: ticketError.message })
    return { ok: false, error: 'לא ניתן לטעון את הפנייה כרגע' }
  }
  const row = ticket as unknown as {
    id: string
    user_id: string | null
    status: TicketStatus
  } | null
  if (!row || row.user_id !== user.id) return { ok: false, error: 'הפנייה לא נמצאה' }

  const posted = await postMessage(admin, {
    ticketId: row.id,
    currentStatus: row.status,
    direction: 'inbound',
    body: parsed.data.body,
    authorId: user.id,
  })
  if (!posted.ok) return { ok: false, error: posted.error }

  revalidatePath(`/account/tickets/${row.id}`)
  return {
    ok: true,
    ticketId: row.id,
    message: posted.reopened ? 'הפנייה נפתחה מחדש וההודעה נשלחה.' : 'ההודעה נשלחה.',
  }
}

// ── The one place a message is written ─────────────────────────────────────

/**
 * Writes the message AND the ticket columns it moves, in that order.
 *
 * THE ORDER IS THE POINT. The message lands first, so the worst case of a
 * failure between the two statements is a ticket whose status is stale by one
 * message - visible, recoverable, and obvious to the next operator who opens
 * it. The other order loses the message and leaves a ticket claiming somebody
 * wrote something that is not there.
 *
 * There is no transaction available here: PostgREST has no multi-statement
 * transaction, and wrapping these in an RPC would put the whole conversation
 * behind a migration that is not applied.
 */
async function postMessage(
  admin: ReturnType<typeof createAdminClient>,
  args: {
    ticketId: string
    currentStatus: TicketStatus
    direction: 'inbound' | 'outbound' | 'internal'
    body: string
    authorId: string | null
    hasFirstResponse?: boolean
  },
): Promise<{ ok: true; reopened: boolean } | { ok: false; error: string }> {
  const now = new Date()

  const { error: messageError } = await admin.from('support_ticket_messages').insert({
    ticket_id: args.ticketId,
    direction: args.direction,
    body: args.body,
    author_id: args.authorId,
  } as never)
  if (messageError) {
    if (notApplied(messageError.code)) return { ok: false, error: NOT_APPLIED_MESSAGE }
    log.error('support.message_insert_failed', {
      ticketId: args.ticketId,
      reason: messageError.message,
    })
    return { ok: false, error: 'שליחת ההודעה נכשלה, נסו שוב' }
  }

  const transition = applyMessage({
    currentStatus: args.currentStatus,
    direction: args.direction,
    hasFirstResponse: args.hasFirstResponse ?? true,
    at: now,
  })

  const patch: Record<string, unknown> = { status: transition.status }
  if (transition.closedAt !== undefined) patch.closed_at = transition.closedAt
  if (transition.firstResponseAt !== undefined) patch.first_response_at = transition.firstResponseAt
  if (transition.lastCustomerMessageAt !== undefined) {
    patch.last_customer_message_at = transition.lastCustomerMessageAt
  }

  const { error: updateError } = await admin
    .from('support_tickets')
    .update(patch as never)
    .eq('id', args.ticketId)
  if (updateError) {
    // The message IS saved. Reporting a failure here would make the customer
    // send it again, so this is logged and swallowed: a stale status is a
    // smaller problem than a duplicated conversation.
    log.warn('support.ticket_update_failed', {
      ticketId: args.ticketId,
      reason: updateError.message,
    })
  }

  return { ok: true, reopened: transition.reopened }
}

export async function openOrderTicket(
  prev: SupportState,
  formData: FormData,
): Promise<SupportState> {
  return withActionContext('support.open_order_ticket', () => runOpenOrderTicket(prev, formData))
}

export async function replyToTicket(prev: SupportState, formData: FormData): Promise<SupportState> {
  return withActionContext('support.reply', () => runReplyToTicket(prev, formData))
}
