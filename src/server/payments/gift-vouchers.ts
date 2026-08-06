import { createGiftClaimToken } from '@/lib/gifts/claim-token'
import { log } from '@/lib/observability/log'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Turning the coupons of a gift order into gifts, once, after they are issued.
 *
 * WHERE THIS SITS AND WHY IT CANNOT THROW
 *
 * At the end of `finalizeOrder`, next to the settlement journal, the invoice and
 * the voucher email, and under the same rule as all three: the card has been
 * charged and the order is closed, so nothing here may unwind it. A gift that
 * failed to send is a support conversation; a finalize that threw after a
 * successful charge is money taken against an order that does not exist.
 *
 * WHAT A GIFT ACTUALLY IS HERE
 *
 * The voucher stays owned by the BUYER and gains a claim token. Ownership moves
 * only when the recipient opens the link and signs in. Two reasons, both
 * structural rather than stylistic:
 *
 *   - The recipient usually has no account. `vouchers.user_id` is NOT NULL, so
 *     at purchase time there is no id to write.
 *   - The buyer paid. Until someone claims the gift, they are who a refund
 *     belongs to and who the receipt names. Handing ownership to an email
 *     address would leave the coupon owned by nobody.
 *
 * IDEMPOTENCY. finalize is replay-safe and can run twice for one order, so the
 * token is minted only for a voucher that has none (`gift_sent_at IS NULL`
 * guards the update), and the outbox row is keyed
 * `gift:<voucher_id>` on the unique `dedupe_key`. A replay re-reads, finds the
 * work done, and enqueues nothing.
 */

type AdminClient = SupabaseClient

export interface GiftIntent {
  recipientName: string | null
  recipientEmail: string
  message: string | null
}

/** Postgres: undefined_column, i.e. 108 has not been applied to this database. */
const UNDEFINED_COLUMN = '42703'

export function readGiftIntent(order: {
  gift_recipient_email?: string | null
  gift_recipient_name?: string | null
  gift_message?: string | null
}): GiftIntent | null {
  const email = order.gift_recipient_email?.trim()
  if (!email) return null
  return {
    recipientEmail: email,
    recipientName: order.gift_recipient_name?.trim() || null,
    message: order.gift_message?.trim() || null,
  }
}

/**
 * Marks every unsent voucher of the order as a gift and queues one email each.
 *
 * Returns how many were sent, for the caller's log. Never throws.
 */
export async function sendOrderGifts(
  admin: AdminClient,
  input: {
    orderId: string
    buyerUserId: string
    intent: GiftIntent
    buyerName?: string | null
    now?: Date
  },
): Promise<{ sent: number; reason?: string }> {
  const now = input.now ?? new Date()
  try {
    const { data, error } = await admin
      .from('vouchers')
      .select('id, product_id, expires_at, gift_sent_at')
      .eq('order_id', input.orderId)
      .eq('status', 'issued')

    if (error) {
      // A database without 108 has no gift columns, and the right behaviour
      // there is the behaviour before this feature existed.
      if (error.code === UNDEFINED_COLUMN) {
        log.warn('gifts.columns_missing', { orderId: input.orderId })
        return { sent: 0, reason: 'columns_missing' }
      }
      log.error('gifts.read_failed', { orderId: input.orderId, reason: error.message })
      return { sent: 0, reason: error.message }
    }

    const vouchers = (data ?? []) as unknown as {
      id: string
      product_id: string | null
      expires_at: string | null
      gift_sent_at: string | null
    }[]
    const pending = vouchers.filter((v) => !v.gift_sent_at)
    if (pending.length === 0) return { sent: 0, reason: 'nothing_to_send' }

    const productIds = [
      ...new Set(pending.map((v) => v.product_id).filter((v): v is string => !!v)),
    ]
    const names = new Map<string, string>()
    if (productIds.length > 0) {
      const { data: products } = await admin
        .from('products')
        .select('id, name_he')
        .in('id', productIds)
      for (const p of (products ?? []) as { id: string; name_he: string | null }[]) {
        if (p.name_he) names.set(p.id, p.name_he)
      }
    }

    let sent = 0
    for (const voucher of pending) {
      const { token, hash } = createGiftClaimToken()

      // Guarded on `gift_sent_at IS NULL`, so two concurrent finalizes cannot
      // both mint a token and send two links for one coupon.
      const { data: updated, error: updateError } = await admin
        .from('vouchers')
        .update({
          gift_recipient_name: input.intent.recipientName,
          gift_recipient_email: input.intent.recipientEmail,
          gift_message: input.intent.message,
          gift_claim_token_hash: hash,
          gift_sent_at: now.toISOString(),
        } as never)
        .eq('id', voucher.id)
        .is('gift_sent_at', null)
        .select('id')
        .maybeSingle()

      if (updateError || !updated) continue

      const { error: queueError } = await admin.from('notification_outbox').insert({
        kind: 'voucher_gifted',
        recipient_email: input.intent.recipientEmail,
        payload: {
          product_name: voucher.product_id ? (names.get(voucher.product_id) ?? null) : null,
          sender_name: input.buyerName ?? null,
          recipient_name: input.intent.recipientName,
          gift_message: input.intent.message,
          // The RAW token, and this is the only place it is ever written. The
          // outbox row is service-role only and the drain deletes nothing, so
          // it lives exactly as long as the claim link does.
          claim_token: token,
          expires_at: voucher.expires_at,
        },
        dedupe_key: `gift:${voucher.id}`,
      } as never)

      if (queueError && !queueError.message.includes('duplicate')) {
        log.error('gifts.queue_failed', { voucherId: voucher.id, reason: queueError.message })
        continue
      }
      sent += 1
    }

    log.info('gifts.sent', { orderId: input.orderId, sent, of: pending.length })
    return { sent }
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'gift send failed'
    log.error('gifts.threw', { orderId: input.orderId, reason })
    return { sent: 0, reason }
  }
}
