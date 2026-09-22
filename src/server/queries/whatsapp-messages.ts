import type { createAdminClient } from '@/lib/supabase/admin'

/**
 * Reading `whatsapp_inbound_messages` for the admin conversation viewer
 * (`/admin/whatsapp/messages`).
 *
 * `order_id` SHIPS IN PENDING/238, NOT YET APPLIED. The same shape this
 * codebase already uses for `notifications.outbox_id` (pending/223) and
 * `deal_candidates` (pending/237): try the full select, and if the column is
 * the reason it failed, degrade to the columns that do exist rather than
 * showing the whole page as broken. A viewer that 500s because one optional
 * column is not live yet is a worse failure than one that just shows fewer
 * matches.
 */

/** Postgres undefined_column, and PostgREST's schema-cache equivalents. */
const COLUMN_ABSENT = new Set(['42703', 'PGRST204', '42P01', 'PGRST205'])

export interface WhatsAppMessageRow {
  message_sid: string
  phone: string
  body: string
  intent: string
  ticket_id: string | null
  order_id: string | null
  created_at: string
}

type Admin = ReturnType<typeof createAdminClient>

export async function listRecentWhatsAppMessages(
  admin: Admin,
  limit = 200,
): Promise<WhatsAppMessageRow[]> {
  const withOrder = await admin
    .from('whatsapp_inbound_messages' as never)
    .select('message_sid, phone, body, intent, ticket_id, order_id, created_at')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (!withOrder.error) {
    return (withOrder.data ?? []) as unknown as WhatsAppMessageRow[]
  }
  if (!COLUMN_ABSENT.has(withOrder.error.code ?? '')) {
    throw new Error(`whatsapp_inbound_messages read failed: ${withOrder.error.message}`)
  }

  const withoutOrder = await admin
    .from('whatsapp_inbound_messages' as never)
    .select('message_sid, phone, body, intent, ticket_id, created_at')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (withoutOrder.error) {
    throw new Error(`whatsapp_inbound_messages read failed: ${withoutOrder.error.message}`)
  }

  return ((withoutOrder.data ?? []) as unknown as Omit<WhatsAppMessageRow, 'order_id'>[]).map(
    (row) => ({ ...row, order_id: null }),
  )
}
