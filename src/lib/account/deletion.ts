import { log } from '@/lib/observability/log'
import type { createAdminClient } from '@/lib/supabase/admin'

/**
 * Account deletion, GDPR/Amendment-13 style: anonymization, not row deletion.
 *
 * Hard-deleting the auth user is impossible here and the constraints say so
 * on purpose: `orders`, `vouchers`, `referrals`, `coupon_codes` and
 * `affiliates` reference auth.users with ON DELETE RESTRICT (the bookkeeping
 * law wins over the erasure request), while `wallet_transactions` CASCADEs,
 * so `auth.admin.deleteUser` would either fail outright or destroy the money
 * ledger depending on what the user owns. Measured on production pg_constraint
 * on 2026-09-09.
 *
 * So the cascade does three different things to three kinds of rows:
 *  - PURGED_ROWS: preference and tracking rows nobody must retain. Deleted.
 *  - scrubbed in place: rows other records point at (profile, addresses) or
 *    that must stop acting (subscriptions). PII overwritten, row kept.
 *  - RETAINED_FOR_LAW: the accounting trail. Untouched, and listed here so a
 *    test can refuse any attempt to add one of them to the purge list.
 *
 * The auth user itself is kept, stripped of email/phone/metadata and banned,
 * which ends every way of logging into the shell that remains.
 */

export { DELETE_CONFIRM_WORD } from './deletion-confirm'

/** Long enough to outlive the account. GoTrue has no permanent flag. */
export const DELETION_BAN_DURATION = '87600h'

export function anonymizedEmail(userId: string): string {
  // Unique per user (profiles.email is NOT NULL) and on a domain we control,
  // so a future real signup can never collide with a tombstone.
  return `deleted-${userId}@anonymized.kenyonexpress.co.il`
}

/** Placeholder for NOT NULL text columns whose content must go. */
export const SCRUB_PLACEHOLDER = 'נמחק'

/** Rows deleted outright: preferences, devices, tracking. No money, ever. */
export const PURGED_ROWS: ReadonlyArray<{ table: string; column: string }> = [
  { table: 'payment_tokens', column: 'profile_id' },
  { table: 'carts', column: 'profile_id' },
  { table: 'wishlists', column: 'user_id' },
  { table: 'user_recent_searches', column: 'user_id' },
  { table: 'push_subscriptions', column: 'user_id' },
  { table: 'push_tokens', column: 'user_id' },
  { table: 'webauthn_credentials', column: 'user_id' },
  { table: 'reviews', column: 'user_id' },
  { table: 'newsletter_subscribers', column: 'user_id' },
  { table: 'whatsapp_contacts', column: 'user_id' },
  { table: 'abandoned_cart_nudges', column: 'user_id' },
  { table: 'referral_signals', column: 'user_id' },
]

/**
 * The accounting and ledger trail, retained under the bookkeeping and tax
 * retention duties the privacy policy's retention section names. The deletion
 * test asserts the purge list never gains one of these.
 */
export const RETAINED_FOR_LAW: ReadonlyArray<string> = [
  'orders',
  'order_items',
  'payments',
  'payment_events',
  'refunds',
  'vouchers',
  'voucher_redemptions',
  'wallet_accounts',
  'wallet_balances',
  'wallet_entries',
  'wallet_transactions',
  'cashback_ledger',
  'escrow_holds',
  'referrals',
  'coupon_codes',
  'discount_redemptions',
  'affiliates',
  'audit_log',
]

export interface CascadeResult {
  /** Steps that failed but do not leave the account reachable. */
  failed: string[]
  /** profiles scrub or the auth scrub: failure here means the PII survived. */
  criticalFailed: string[]
}

type AdminClient = ReturnType<typeof createAdminClient>

/**
 * Runs the whole cascade, continuing past individual failures: one dead table
 * must not keep every other table's PII alive. Failures come back by name so
 * the caller can decide (and the audit row records them).
 */
export async function runAnonymizationCascade(
  admin: AdminClient,
  userId: string,
): Promise<CascadeResult> {
  const failed: string[] = []
  const criticalFailed: string[] = []
  const now = new Date().toISOString()

  for (const target of PURGED_ROWS) {
    const { error } = await admin.from(target.table).delete().eq(target.column, userId)
    if (error) {
      failed.push(target.table)
      log.error('privacy.purge_failed', { table: target.table, reason: error.message })
    }
  }

  // Orders keep resolving address_id, so the rows stay; the person inside
  // them does not. NOT NULL columns get the placeholder, the rest go null.
  const { error: addressError } = await admin
    .from('user_addresses')
    .update({
      full_name: SCRUB_PLACEHOLDER,
      phone: '',
      street: SCRUB_PLACEHOLDER,
      street_number: null,
      apartment: null,
      entrance: null,
      floor: null,
      city: SCRUB_PLACEHOLDER,
      zip: null,
      notes_for_courier: null,
      is_default: false,
      deleted_at: now,
    })
    .eq('user_id', userId)
  if (addressError) {
    failed.push('user_addresses')
    log.error('privacy.scrub_failed', { table: 'user_addresses', reason: addressError.message })
  }

  // A live subscription would keep charging a card whose token was just
  // purged; cancel instead of letting the biller discover that at 3am.
  const { error: subscriptionError } = await admin
    .from('subscriptions')
    .update({ status: 'canceled', canceled_at: now, cancel_reason: 'account_deleted' })
    .eq('user_id', userId)
    .in('status', ['active', 'past_due', 'paused'])
  if (subscriptionError) {
    failed.push('subscriptions')
    log.error('privacy.scrub_failed', { table: 'subscriptions', reason: subscriptionError.message })
  }

  const { error: ticketError } = await admin
    .from('support_tickets')
    .update({ phone: null })
    .eq('user_id', userId)
  if (ticketError) {
    failed.push('support_tickets')
    log.error('privacy.scrub_failed', { table: 'support_tickets', reason: ticketError.message })
  }

  // The profile row is the hub every retained row points at through user_id,
  // so it stays; email is NOT NULL and unique, hence the tombstone address.
  const { error: profileError } = await admin
    .from('profiles')
    .update({
      email: anonymizedEmail(userId),
      full_name: null,
      phone: null,
      avatar_url: null,
    })
    .eq('id', userId)
  if (profileError) {
    criticalFailed.push('profiles')
    log.error('privacy.scrub_failed', { table: 'profiles', reason: profileError.message })
  }

  const { error: authError } = await admin.auth.admin.updateUserById(userId, {
    email: anonymizedEmail(userId),
    user_metadata: {},
    ban_duration: DELETION_BAN_DURATION,
  })
  if (authError) {
    criticalFailed.push('auth')
    log.error('privacy.auth_scrub_failed', { reason: authError.message })
  } else {
    // GoTrue rejects an empty phone on some versions, and a failure here must
    // not undo the ban above, so the phone gets its own best-effort call.
    const { error: phoneError } = await admin.auth.admin.updateUserById(userId, { phone: '' })
    if (phoneError) {
      failed.push('auth.phone')
      log.warn('privacy.auth_phone_scrub_failed', { reason: phoneError.message })
    }
  }

  // The proof of erasure a regulator asks for. audit_log is on the retained
  // list; actor_id references auth.users with ON DELETE SET NULL, and the
  // user row still exists anyway.
  const { error: auditError } = await admin.from('audit_log').insert({
    actor_id: userId,
    actor_role: 'user',
    action: 'deleted',
    entity_type: 'account',
    entity_id: userId,
    metadata: { reason: 'self_service_deletion', failed, critical_failed: criticalFailed },
  })
  if (auditError) {
    failed.push('audit_log')
    log.error('privacy.audit_write_failed', { reason: auditError.message })
  }

  return { failed, criticalFailed }
}
