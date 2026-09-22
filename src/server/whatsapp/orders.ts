import { normalizeIsraeliPhone } from '@/lib/whatsapp'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Matching an inbound WhatsApp sender to an order, for the auto-reply order
 * summary a free-text message gets when one is found.
 *
 * THE PHONE COMPARISON HAS TO HAPPEN IN CODE, NOT SQL. `profiles.phone` and
 * `user_addresses.phone` hold whatever a form was given -- "050-1234567",
 * "+972 50 123 4567", "972501234567" -- and Postgres cannot normalise that in
 * a WHERE clause. This is the exact problem `attachPhoneToExistingAccount` in
 * `src/server/actions/auth.ts` already solved for phone-OTP login: a suffix
 * filter (the last seven digits are identical in every spelling of the same
 * number) narrows what the database returns, and the exact match is made
 * afterwards by normalising both sides with the same function.
 *
 * TWO SOURCES, NOT ONE. `profiles.phone` is the account's own number, but a
 * guest checkout or a shopper who never filled it in has none; the delivery
 * contact on `user_addresses.phone` is the fallback, matched by seven of
 * eleven suppliers having no phone at all elsewhere in this codebase's own
 * history of that field being sparse.
 *
 * MOST RECENT ORDER, NOT "THE" ORDER. A returning customer can have several;
 * the one they are most likely writing about is the last one, which is also
 * the same rule the account order-history page defaults to.
 */

export interface WhatsAppMatchedOrder {
  id: string
  status: string
  total_ils_agorot: number | null
  created_at: string
}

async function userIdsForPhone(admin: SupabaseClient, phone: string): Promise<Set<string>> {
  const suffix = phone.slice(-7)
  const ids = new Set<string>()
  if (suffix.length < 7) return ids

  const [profiles, addresses] = await Promise.all([
    admin.from('profiles').select('id, phone').ilike('phone', `%${suffix}`).limit(50),
    admin.from('user_addresses').select('user_id, phone').ilike('phone', `%${suffix}`).limit(50),
  ])

  for (const row of (profiles.data ?? []) as { id: string; phone: string | null }[]) {
    if (normalizeIsraeliPhone(row.phone) === phone) ids.add(row.id)
  }
  for (const row of (addresses.data ?? []) as { user_id: string; phone: string | null }[]) {
    if (normalizeIsraeliPhone(row.phone) === phone) ids.add(row.user_id)
  }
  return ids
}

/**
 * @param phone Already-normalised digits, the shape `waPhoneDigits` produces
 *   (e.g. "972501234567") -- not raw Twilio `From`.
 */
export async function findRecentOrderForPhone(
  admin: SupabaseClient,
  phone: string,
): Promise<WhatsAppMatchedOrder | null> {
  const userIds = await userIdsForPhone(admin, phone)
  if (userIds.size === 0) return null

  const { data, error } = await admin
    .from('orders')
    .select('id, status, total_ils_agorot, created_at')
    .in('user_id', [...userIds])
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(1)

  if (error || !data || data.length === 0) return null
  return data[0] as unknown as WhatsAppMatchedOrder
}
