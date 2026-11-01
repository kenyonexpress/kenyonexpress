import { log } from '@/lib/observability/log'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Pays a referral that `fn_complete_referral` just declared ready.
 *
 * `fn_complete_referral` ends the clean case with `reason: 'ready_to_pay'` and
 * leaves the row at `pending`; it does not move money. `fn_pay_referral` does,
 * and its only caller used to be the admin Approve button, so with
 * `require_manual_approval` false (the default) a referral with no fraud
 * signals waited for a human anyway. `ready_to_pay` is an instruction, and this
 * is what follows it.
 *
 * SAFE TO CALL FROM THE ORDER PATH. `fn_pay_referral` takes FOR UPDATE on the
 * row, answers `already_paid` without moving anything when the status is
 * `completed`, and both transfers go through `fn_wallet_transfer` keyed
 * `referral:<id>:referrer` and `referral:<id>:referred`. A replayed webhook
 * pays nothing twice at two independent layers. It refuses honestly
 * (`no_reserve_account`, `no_referrer_wallet`, `no_referred_wallet`) before any
 * transfer.
 *
 * A FAILURE IS LOGGED, NOT THROWN. The card is already charged when this runs;
 * a thrown error reaches the webhook as "payment verified but finalize
 * failed", the worst state in the system. An unpaid bonus is a row an admin can
 * still settle from `/admin/referrals`.
 *
 * NO NOTIFICATION. The production line also mails both people. That needs the
 * `referral_bonus_credited` outbox kind (a constraint migration) and a mail
 * builder, and main has neither, so the payout ships without the mail rather
 * than with a send that is refused on every run.
 */
export async function payReferralIfReady(admin: SupabaseClient, referralId: string): Promise<void> {
  const { data, error } = await admin.rpc(
    'fn_pay_referral' as never,
    {
      p_referral_id: referralId,
      // No approver: this is the system paying a referral the database already
      // judged clean, and an actor here would put a person's name on a
      // decision they did not make.
      p_approved_by: null,
    } as never,
  )

  if (error) {
    log.warn('referrals.pay_failed', { referralId, reason: error.message })
    return
  }

  const outcome = data as { ok?: boolean; reason?: string } | null
  if (outcome?.ok !== true) {
    log.warn('referrals.pay_refused', { referralId, reason: outcome?.reason ?? 'unknown' })
    return
  }

  // `already_paid` is a success that moved nothing.
  if (outcome.reason !== 'paid') {
    log.info('referrals.pay_noop', { referralId, reason: outcome.reason ?? null })
    return
  }

  log.info('referrals.paid', { referralId })
}
