import { log } from '@/lib/observability/log'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Pays a referral that `fn_complete_referral` just declared ready, and tells
 * both people about it.
 *
 * =========================================================================
 * WHY THIS EXISTS: THE AUTOMATIC PATH WAS NOT AUTOMATIC
 * =========================================================================
 *
 * Measured 2026-09-10, against the live function definitions:
 *
 *   `fn_complete_referral` ends the clean case with
 *   `{ ok: true, reason: 'ready_to_pay', referral_id: <uuid> }` and leaves the
 *   row at `pending`. It does not move money. It never did.
 *
 *   `fn_pay_referral(p_referral_id, p_approved_by DEFAULT NULL)` is what moves
 *   it, and the DEFAULT NULL is the tell: `reviewed_by` and `reviewed_at` are
 *   only written when an approver is passed, so the signature was designed for
 *   a caller that is not a person.
 *
 *   The only caller of `fn_pay_referral` in the repo was
 *   `src/server/actions/admin/referrals.ts` -- the admin Approve button.
 *
 * So with the program active and `require_manual_approval` false (its default),
 * a referral with no fraud signals at all was marked ready and then waited in
 * the review queue for a human, which is precisely what that setting says
 * should not be needed. `ready_to_pay` is an instruction and it was being
 * logged instead of followed. The best referral on the site, the clean one, was
 * the one nothing paid.
 *
 * =========================================================================
 * WHY CALLING IT FROM THE ORDER PATH IS SAFE
 * =========================================================================
 *
 * `fn_pay_referral` takes `FOR UPDATE` on the row, returns `already_paid`
 * without moving anything when the status is `completed`, and both transfers go
 * through `fn_wallet_transfer` keyed `referral:<id>:referrer` and
 * `referral:<id>:referred`. A replayed webhook therefore pays nothing twice at
 * two independent layers.
 *
 * It also refuses honestly rather than half-paying: `no_reserve_account`,
 * `no_referrer_wallet` and `no_referred_wallet` all return before any transfer.
 *
 * =========================================================================
 * WHY A FAILURE IS LOGGED AND NOT THROWN
 * =========================================================================
 *
 * Same reason `completeReferralForOrder` gives: the card is already charged by
 * the time this runs, and a thrown error reaches the webhook as "payment
 * verified but finalize failed", which is the worst state in the system. An
 * unpaid bonus is a row an admin can still settle from `/admin/referrals`; a
 * charged-but-unfinalised order is not.
 */

/** Exactly one mail per person per referral, enforced by the outbox dedupe key. */
export function referralNotificationKey(referralId: string, role: 'referrer' | 'referred'): string {
  return `referral_bonus:${referralId}:${role}`
}

/**
 * The outbox kind for "your referral bonus is in your wallet".
 *
 * NOT `cashback_credited`, which is accepted by the live constraint today and
 * would have saved a migration. Its sentence is `נכנס לך קאשבק`, which sends a
 * referrer looking for a purchase that earned it -- and the referrer did not
 * buy anything, their friend did. This is the same mistake
 * `voucher_expiry_credited` was given its own kind to avoid, written down in
 * `buildVoucherExpiryCreditedEmail`. Shipping a false sentence about money to
 * save a migration file is not a saving.
 *
 * `notification_outbox_kind_check` does not carry it yet; it arrives with
 * `migrations/pending/229`. Until that is applied every enqueue here fails with
 * 23514, which `payReferralIfReady` reads and carries on from, exactly as
 * `/api/cron/settlement-reconcile` does for `settlement_gap`. The builder ships
 * with it so an approved 229 finds the drain already able to render what it
 * lets in.
 */
export const REFERRAL_BONUS_KIND = 'referral_bonus_credited'

/** Postgres check_violation: the kind is not in the constraint on this database. */
const KIND_NOT_ACCEPTED = '23514'

type PayOutcome = { ok?: boolean; reason?: string } | null

export async function payReferralIfReady(admin: SupabaseClient, referralId: string): Promise<void> {
  const { data, error } = await admin.rpc(
    'fn_pay_referral' as never,
    {
      p_referral_id: referralId,
      // No approver: this is the system paying a referral the database already
      // judged clean, and writing an actor here would put a person's name on a
      // decision they did not make.
      p_approved_by: null,
    } as never,
  )

  if (error) {
    log.warn('referrals.pay_failed', { referralId, reason: error.message })
    return
  }

  const outcome = data as PayOutcome
  if (outcome?.ok !== true) {
    log.warn('referrals.pay_refused', { referralId, reason: outcome?.reason ?? 'unknown' })
    return
  }

  // `already_paid` is a success and must NOT produce a second mail. The outbox
  // dedupe key would catch it anyway; not enqueueing is the cheaper of the two
  // and keeps the log honest about how often this actually pays something.
  if (outcome.reason !== 'paid') {
    log.info('referrals.pay_noop', { referralId, reason: outcome.reason ?? null })
    return
  }

  log.info('referrals.paid', { referralId })
  await notifyReferralPaid(admin, referralId)
}

/**
 * One mail to the referrer and one to the referred person.
 *
 * "One email notification on credit" read as one PER CREDIT, not one in total:
 * two people were each credited and each is owed the sentence about their own
 * money. Two dedupe keys, so a replay adds nothing and a partial failure on one
 * side does not suppress the other.
 *
 * ENQUEUED AFTER THE LEDGER MOVE, never before. Same ordering rule the cashback
 * and voucher-expiry mails state: an email promising money the ledger does not
 * hold is a support ticket.
 */
async function notifyReferralPaid(admin: SupabaseClient, referralId: string): Promise<void> {
  const { data: referral, error } = await admin
    .from('referrals')
    .select('id, referrer_user_id, referred_user_id, referrer_bonus_agorot, referred_bonus_agorot')
    .eq('id', referralId)
    .maybeSingle()

  if (error || !referral) {
    log.warn('referrals.notify_read_failed', { referralId, reason: error?.message ?? 'no row' })
    return
  }

  const row = referral as unknown as {
    referrer_user_id: string | null
    referred_user_id: string | null
    referrer_bonus_agorot: number | null
    referred_bonus_agorot: number | null
  }

  const userIds = [row.referrer_user_id, row.referred_user_id].filter(
    (id): id is string => typeof id === 'string',
  )
  if (userIds.length === 0) return

  const { data: profiles, error: profilesError } = await admin
    .from('profiles')
    .select('id, email')
    .in('id', userIds)

  if (profilesError) {
    log.warn('referrals.notify_profiles_failed', { referralId, reason: profilesError.message })
    return
  }

  const emails = new Map<string, string>()
  for (const p of (profiles ?? []) as Array<{ id: string; email: string | null }>) {
    if (p.email) emails.set(p.id, p.email)
  }

  const sides: Array<{ role: 'referrer' | 'referred'; userId: string | null; amount: number }> = [
    { role: 'referrer', userId: row.referrer_user_id, amount: row.referrer_bonus_agorot ?? 0 },
    { role: 'referred', userId: row.referred_user_id, amount: row.referred_bonus_agorot ?? 0 },
  ]

  for (const side of sides) {
    // A zero bonus moved no money, so there is nothing to announce. The payer
    // skips those transfers for the same reason.
    if (side.amount <= 0 || !side.userId) continue
    const email = emails.get(side.userId)
    if (!email) {
      log.warn('referrals.notify_no_email', { referralId, role: side.role })
      continue
    }

    const { error: enqueueError } = await admin.rpc(
      'fn_enqueue_notification' as never,
      {
        p_kind: REFERRAL_BONUS_KIND,
        p_email: email,
        p_dedupe: referralNotificationKey(referralId, side.role),
        p_payload: { amount_agorot: side.amount, role: side.role },
      } as never,
    )

    if (enqueueError) {
      log.warn('referrals.notify_enqueue_failed', {
        referralId,
        role: side.role,
        reason: enqueueError.message,
        kind_not_accepted: enqueueError.code === KIND_NOT_ACCEPTED,
      })
    }
  }
}
