import { buildShippedNotice } from '@/lib/shipping/shipped-notice'
import type { Database } from '@/types/database'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Tells the customer a parcel left, from the place where a parcel actually
 * leaves.
 *
 * The reasoning about keys, partial orders and the dormant database trigger is
 * in `lib/shipping/shipped-notice.ts`; this file is only the IO around it, and
 * it is shared by the admin action and the supplier action so the two cannot
 * drift into telling the customer different things.
 *
 * IT NEVER THROWS, AND THE ORDER OF OPERATIONS IS THE REASON
 *
 * The parcel is already on a courier's van by the time this runs. If the
 * notification insert fails, the truthful outcome is "shipped, customer not
 * told" -- not "shipping failed", which is what an exception here would show
 * the operator, who would then click the button again and be refused because
 * the line already moved. So the result is reported and the caller decides
 * whether to mention it.
 */

type Admin = SupabaseClient<Database>

export type ShippedNoticeResult =
  | { enqueued: true; partial: boolean }
  | { enqueued: false; reason: 'no_recipient' | 'read_failed' | 'enqueue_failed' }

export async function notifyOrderShipped(
  admin: Admin,
  orderId: string,
  shippedItemId: string,
  now: Date = new Date(),
): Promise<ShippedNoticeResult> {
  const { data: order, error: orderError } = await admin
    .from('orders')
    .select('id, user_id')
    .eq('id', orderId)
    .maybeSingle()
  if (orderError || !order) return { enqueued: false, reason: 'read_failed' }

  /**
   * Two queries rather than a PostgREST embed. `orders.user_id` is nullable and
   * every other reader in this codebase fetches the profile separately; an
   * embed here would also have to guess whether the relationship comes back as
   * an object or a one-element array, and guessing wrong is a silent null.
   */
  let profile: { email: string | null; full_name: string | null } | null = null
  if (order.user_id) {
    const { data, error: profileError } = await admin
      .from('profiles')
      .select('email, full_name')
      .eq('id', order.user_id)
      .maybeSingle()
    // Distinguished from "no such profile": a failed read must not be reported
    // as "this customer has no address", which would look like a settled
    // answer and stop anybody looking.
    if (profileError) return { enqueued: false, reason: 'read_failed' }
    profile = data ?? null
  }

  const email = (profile?.email ?? '').trim()
  // A guest order with no profile has nowhere to send this. Reported, not
  // retried: no amount of retrying will produce an address.
  if (!email || !email.includes('@')) return { enqueued: false, reason: 'no_recipient' }

  const { data: lines, error: linesError } = await admin
    .from('order_items')
    .select('id, item_status, product_type, carrier, tracking_number')
    .eq('order_id', orderId)
  if (linesError || !lines) return { enqueued: false, reason: 'read_failed' }

  const notice = buildShippedNotice({
    orderId,
    shippedItemId,
    at: now.toISOString(),
    customerName: profile?.full_name ?? null,
    lines: lines.map((l) => ({
      id: l.id,
      itemStatus: l.item_status,
      productType: l.product_type,
      carrier: l.carrier ?? null,
      trackingNumber: l.tracking_number ?? null,
    })),
  })

  /**
   * The four-argument overload, not the five: it resolves `user_id` from the
   * address itself, which is the right answer for an order placed by a guest
   * who later signed up with the same email -- and for one placed by a user
   * whose row was since merged.
   */
  const { error: enqueueError } = await admin.rpc('fn_enqueue_notification', {
    p_kind: 'order_shipped',
    p_email: email,
    p_dedupe: notice.dedupeKey,
    p_payload: notice.payload as never,
  })
  if (enqueueError) return { enqueued: false, reason: 'enqueue_failed' }

  return { enqueued: true, partial: notice.partial }
}
