import { log } from '@/lib/observability/log'
import type { createAdminClient } from '@/lib/supabase/admin'
import type { TicketPriority, TicketStatus } from '@/server/domain/support/sla'

/**
 * Reads for the ticket console and the customer's own ticket pages.
 *
 * "NOT APPLIED" IS ITS OWN VALUE, not an empty list. 203 adds the columns these
 * selects name, so before it is applied every one of them raises 42703 and
 * takes down the whole statement. A console that renders "אין פניות" over a
 * query that could not run tells the operator the opposite of the truth, and on
 * a support queue that is the difference between an empty desk and an unread
 * one.
 */

type Client = ReturnType<typeof createAdminClient>

const MISSING = new Set(['42P01', 'PGRST205', 'PGRST204', '42703'])

export const NOT_APPLIED = 'NOT_APPLIED' as const
export type NotApplied = typeof NOT_APPLIED

export type TicketRow = {
  id: string
  subject: string | null
  status: TicketStatus
  priority: TicketPriority
  channel: string
  category: string | null
  created_at: string
  first_response_at: string | null
  closed_at: string | null
  order_id: string | null
  email: string | null
  phone: string | null
  user_id: string | null
  assigned_to: string | null
}

const TICKET_COLUMNS =
  'id, subject, status, priority, channel, category, created_at, first_response_at, closed_at, order_id, email, phone, user_id, assigned_to'

export type TicketMessage = {
  id: string
  direction: 'inbound' | 'outbound' | 'internal'
  body: string
  created_at: string
  author_id: string | null
}

/** The operator queue. Open work only; closed tickets are history. */
export async function listOpenTickets(client: Client): Promise<TicketRow[] | NotApplied> {
  const { data, error } = await client
    .from('support_tickets')
    .select(TICKET_COLUMNS)
    .in('status', ['open', 'pending', 'waiting_customer'])
    // Oldest first WITHIN a priority: a queue sorted by priority alone lets an
    // urgent ticket opened this minute jump one opened yesterday, and the
    // person who has waited a day is the one the SLA is about to fail.
    .order('priority', { ascending: true })
    .order('created_at', { ascending: true })
    .limit(200)

  if (error) {
    if (MISSING.has(error.code ?? '')) return NOT_APPLIED
    log.error('support.queue_read_failed', { reason: error.message })
    return []
  }
  return (data ?? []) as unknown as TicketRow[]
}

/** One customer's tickets, newest first. */
export async function listUserTickets(
  client: Client,
  userId: string,
): Promise<TicketRow[] | NotApplied> {
  const { data, error } = await client
    .from('support_tickets')
    .select(TICKET_COLUMNS)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) {
    if (MISSING.has(error.code ?? '')) return NOT_APPLIED
    log.error('support.user_tickets_read_failed', { userId, reason: error.message })
    return []
  }
  return (data ?? []) as unknown as TicketRow[]
}

export async function readTicket(
  client: Client,
  ticketId: string,
): Promise<TicketRow | null | NotApplied> {
  const { data, error } = await client
    .from('support_tickets')
    .select(TICKET_COLUMNS)
    .eq('id', ticketId)
    .maybeSingle()
  if (error) {
    if (MISSING.has(error.code ?? '')) return NOT_APPLIED
    log.error('support.ticket_read_failed', { ticketId, reason: error.message })
    return null
  }
  return (data as unknown as TicketRow) ?? null
}

/**
 * @param includeInternal false for the customer's own view.
 *
 * FILTERED HERE AS WELL AS IN RLS, and the duplication is deliberate. These
 * pages read on the SERVICE-ROLE client, which does not consult RLS at all, so
 * the policy 203 tightens is not what protects the customer on this path - this
 * argument is. The policy protects the other path, where somebody queries
 * PostgREST directly with their own token. Both are needed and neither is
 * redundant.
 */
export async function listTicketMessages(
  client: Client,
  ticketId: string,
  includeInternal: boolean,
): Promise<TicketMessage[]> {
  let query = client
    .from('support_ticket_messages')
    .select('id, direction, body, created_at, author_id')
    .eq('ticket_id', ticketId)
    .order('created_at', { ascending: true })
    .limit(500)

  if (!includeInternal) query = query.neq('direction', 'internal')

  const { data, error } = await query
  if (error) {
    if (!MISSING.has(error.code ?? '')) {
      log.error('support.messages_read_failed', { ticketId, reason: error.message })
    }
    return []
  }
  return (data ?? []) as unknown as TicketMessage[]
}
