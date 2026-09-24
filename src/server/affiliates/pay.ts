import { agorot, agorotToIls } from '@/lib/money'
import { log } from '@/lib/observability/log'
import type { createAdminClient } from '@/lib/supabase/admin'

type AdminClient = ReturnType<typeof createAdminClient>

/** The wallet ledger reason. Labelled in `server/queries/account.ts`. */
export const AFFILIATE_WALLET_REASON = 'affiliate_commission'

/** The reserve every platform-funded credit is drawn from (cashback, referral). */
const RESERVE_ACCOUNT_CODE = 'platform:cashback_reserve'

export type PayOutcome =
  | { ok: true; reason: 'paid' | 'already_paid' }
  | {
      ok: false
      reason:
        | 'not_found'
        | 'rejected'
        | 'no_reserve_account'
        | 'no_affiliate_wallet'
        | 'transfer_failed'
    }

interface ConversionRow {
  id: string
  affiliate_id: string
  order_id: string
  status: string
  commission_agorot: number
}

async function userWalletAccount(
  admin: AdminClient,
  userId: string,
): Promise<{ id: string } | null> {
  const { data: existing, error: readError } = await admin
    .from('wallet_accounts')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle()
  if (readError) {
    log.warn('affiliates.wallet_account_read_failed', { userId, reason: readError.message })
    return null
  }
  if (existing) return existing
  // Same shape as finalize's getOrCreateUserWalletAccount: the insert may lose
  // a race on the unique user_id, and the re-read is the handler for that.
  // The INSERT keeps its error only as a signal: 23505 is the expected answer
  // to a race and the re-read below is its handler.
  const { data: created, error: insertError } = await admin
    .from('wallet_accounts')
    .insert({ user_id: userId })
    .select('id')
    .maybeSingle()
  if (created) return created
  if (insertError && insertError.code !== '23505') {
    log.warn('affiliates.wallet_account_insert_failed', { userId, reason: insertError.message })
  }
  const { data: reread, error: rereadError } = await admin
    .from('wallet_accounts')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle()
  if (rereadError) {
    log.warn('affiliates.wallet_account_reread_failed', { userId, reason: rereadError.message })
    return null
  }
  return reread ?? null
}

/**
 * Credits one conversion's commission to the affiliate's wallet and marks it paid.
 *
 * ONE PATH FOR BOTH CALLERS. The finalize path calls this with no approver for
 * a conversion the checks judged clean; the admin queue calls it with the
 * approver's id for a flagged one. A queue that paid through its own code
 * would be a queue whose payouts the finalize tests never cover, the same
 * argument 098 makes for fn_pay_referral.
 *
 * IDEMPOTENT AT TWO LAYERS. `fn_wallet_transfer` returns the existing entry
 * for a repeated idempotency key (`affiliate:<conversion id>`) and moves
 * nothing, and the status update only flips rows still at pending/flagged.
 * A double click on the queue or a replayed webhook credits nothing twice.
 *
 * TRANSFER FIRST, STATUS SECOND. If the transfer succeeds and the update
 * fails, a retry re-transfers nothing (idempotency) and flips the row; if the
 * order were reversed, a failed transfer would leave a row that says paid
 * over a wallet that is not. The counters on `affiliates` are bumped only by
 * the caller whose update actually flipped the row.
 */
export async function payAffiliateConversion(
  admin: AdminClient,
  conversionId: string,
  approvedBy: string | null,
): Promise<PayOutcome> {
  const { data: rowData, error: rowError } = await admin
    .from('affiliate_conversions' as never)
    .select('id, affiliate_id, order_id, status, commission_agorot')
    .eq('id', conversionId)
    .maybeSingle()
  if (rowError || !rowData) {
    log.warn('affiliates.pay_read_failed', { conversionId, reason: rowError?.message ?? 'no row' })
    return { ok: false, reason: 'not_found' }
  }
  const row = rowData as unknown as ConversionRow
  if (row.status === 'paid') return { ok: true, reason: 'already_paid' }
  if (row.status === 'rejected') return { ok: false, reason: 'rejected' }

  const { data: affiliate, error: affiliateError } = await admin
    .from('affiliates')
    .select('id, user_id, total_conversions, total_earnings_ils_agorot')
    .eq('id', row.affiliate_id)
    .maybeSingle()
  if (affiliateError || !affiliate) {
    log.warn('affiliates.pay_affiliate_missing', { conversionId })
    return { ok: false, reason: 'no_affiliate_wallet' }
  }

  const commission = agorot(Math.round(Number(row.commission_agorot)))

  const [{ data: reserve }, wallet] = await Promise.all([
    admin.from('wallet_accounts').select('id').eq('code', RESERVE_ACCOUNT_CODE).maybeSingle(),
    userWalletAccount(admin, affiliate.user_id),
  ])
  if (!reserve) {
    log.warn('affiliates.pay_no_reserve', { conversionId })
    return { ok: false, reason: 'no_reserve_account' }
  }
  if (!wallet) {
    log.warn('affiliates.pay_no_wallet', { conversionId, affiliateId: affiliate.id })
    return { ok: false, reason: 'no_affiliate_wallet' }
  }

  if (commission > 0) {
    // Shekels at the boundary only: fn_wallet_transfer takes p_amount_ils, and
    // agorotToIls is the one sanctioned conversion (finalize uses the same).
    const { error: transferError } = await admin.rpc('fn_wallet_transfer', {
      p_debit_account: reserve.id,
      p_credit_account: wallet.id,
      p_amount_ils: agorotToIls(commission),
      p_reason: AFFILIATE_WALLET_REASON,
      p_idempotency: `affiliate:${row.id}`,
      p_order_id: row.order_id,
    })
    if (transferError) {
      log.warn('affiliates.pay_transfer_failed', { conversionId, reason: transferError.message })
      return { ok: false, reason: 'transfer_failed' }
    }
  }

  const now = new Date().toISOString()
  const { data: flipped, error: flipError } = await admin
    .from('affiliate_conversions' as never)
    .update({
      status: 'paid',
      paid_at: now,
      reviewed_by: approvedBy,
      reviewed_at: approvedBy ? now : null,
    } as never)
    .eq('id', row.id)
    .in('status', ['pending', 'flagged'])
    .select('id')
  if (flipError) {
    // The money has moved and the idempotency key holds it. The row will be
    // flipped by the next call; nothing is paid twice in the meantime.
    log.warn('affiliates.pay_status_update_failed', { conversionId, reason: flipError.message })
    return { ok: false, reason: 'transfer_failed' }
  }
  if (!flipped || (flipped as unknown[]).length === 0) return { ok: true, reason: 'already_paid' }

  // Counters the admin console already displays. `total_earnings_ils_agorot`
  // is a generated column (141) so the shekel twin is what gets written, from
  // an integer-agorot sum converted once at the boundary.
  const previousAgorot = agorot(Math.round(Number(affiliate.total_earnings_ils_agorot ?? 0)))
  const { error: counterError } = await admin
    .from('affiliates')
    .update({
      total_conversions: (affiliate.total_conversions ?? 0) + 1,
      total_earnings_ils: agorotToIls(agorot(previousAgorot + commission)),
    })
    .eq('id', affiliate.id)
  if (counterError) {
    log.warn('affiliates.pay_counter_update_failed', { conversionId, reason: counterError.message })
  }

  log.info('affiliates.paid', {
    conversionId,
    affiliateId: affiliate.id,
    commissionAgorot: commission,
  })
  return { ok: true, reason: 'paid' }
}
