/**
 * Email scheduling for C20 transactional emails.
 *
 * Handles scheduling of:
 * - expiry_t7: 7 days before voucher expiration
 * - expiry_t1: 1 day before voucher expiration
 * - gift_coupon: Queued delivery via notification outbox
 */

import { log } from '@/lib/observability/log'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Schedule expiry reminders for T-7 and T-1 days.
 *
 * Called by /api/cron/expire-vouchers to queue reminders for vouchers
 * expiring in 7 days and 1 day. Uses the database function
 * enqueue_expiring_voucher_notices([7, 1]) from migration 114.
 *
 * @returns Count of reminders queued, or null on error
 */
export async function scheduleExpiryReminders(): Promise<number | null> {
  const admin = createAdminClient()

  // Queue T-7 and T-1 reminders via the database function
  const { data: reminders, error } = await admin.rpc('enqueue_expiring_voucher_notices', {
    p_buckets: [7, 1],
  })

  if (error) {
    log.error('emails.expiry_reminders_schedule_failed', {
      reason: error.message,
      buckets: [7, 1],
    })
    return null
  }

  return reminders ?? 0
}

/**
 * Queue gift coupon email for delivery.
 *
 * Called when a gift coupon is purchased. The email is queued via the
 * notification_outbox table and will be sent by /api/cron/notifications.
 *
 * @param userId - Recipient user ID
 * @param email - Recipient email address
 * @param payload - Gift coupon data (product_name, claim_token, etc.)
 * @returns true if queued successfully
 */
export async function scheduleGiftCoupon(
  userId: string | null,
  email: string,
  payload: {
    product_name?: string
    sender_name?: string
    recipient_name?: string
    gift_message?: string
    claim_token: string
    expires_at?: string
  },
): Promise<boolean> {
  const admin = createAdminClient()

  // Use the notification queue function to enqueue the gift email
  const { error } = await admin.rpc('fn_enqueue_notification', {
    p_kind: 'voucher_gifted',
    p_recipient_email: email,
    p_dedupe_key: `gift:${payload.claim_token}`,
    p_payload: payload,
    p_user_id: userId,
  })

  if (error) {
    log.error('emails.gift_coupon_schedule_failed', {
      reason: error.message,
      claim_token: payload.claim_token,
    })
    return false
  }

  return true
}

/**
 * Schedule purchase confirmation email.
 *
 * Queued via notification_outbox when an order is finalized.
 * The trigger in the database (migration 095) handles this automatically,
 * but this function can be called directly if needed.
 *
 * @param orderId - Order UUID
 * @param email - Customer email
 * @param payload - Order data for email template
 * @returns true if queued successfully
 */
export async function schedulePurchaseConfirmation(
  orderId: string,
  email: string,
  payload: {
    order_ref?: string
    customer_name?: string
    total_agorot: number
    item_count?: number
  },
): Promise<boolean> {
  const admin = createAdminClient()

  const { error } = await admin.rpc('fn_enqueue_notification', {
    p_kind: 'order_paid',
    p_recipient_email: email,
    p_dedupe_key: `order:${orderId}:confirmation`,
    p_payload: {
      ...payload,
      order_id: orderId,
    },
    p_user_id: null,
  })

  if (error) {
    log.error('emails.purchase_confirmation_schedule_failed', {
      reason: error.message,
      order_id: orderId,
    })
    return false
  }

  return true
}
