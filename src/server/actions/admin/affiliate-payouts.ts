'use server'

import { writeAuditLog } from '@/lib/admin/audit'
import { type AdminSessionInfo, requireSection } from '@/lib/admin/rbac'
import { AFFILIATE_PAYOUT_REASON } from '@/lib/affiliates/payout'
import { agorot, agorotToIls } from '@/lib/money'
import { withActionContext } from '@/lib/observability/action-context'
import { log } from '@/lib/observability/log'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

export type PayoutActionState = { error: string } | { success: string } | null

/** The reserve `affiliate_commission` was drawn from; the debit returns there. */
const RESERVE_ACCOUNT_CODE = 'platform:cashback_reserve'

/** Postgres: undefined_table. A database without 252 has no payout table. */
const UNDEFINED_TABLE = '42P01'
const NOT_APPLIED =
  'הטבלה עדיין לא קיימת: יש להחיל את migrations/pending/252_affiliate_clicks_payouts.sql'

const decisionSchema = z.object({
  id: z.string().uuid({ message: 'מזהה לא תקין' }),
  decision: z.enum(['paid', 'reject']),
  note: z.string().trim().max(300, 'עד 300 תווים').optional().default(''),
})

interface PayoutRow {
  id: string
  affiliate_id: string
  user_id: string
  amount_agorot: number
  status: string
}

/**
 * Marks one payout request paid or rejected.
 *
 * PAID DEBITS THE WALLET FIRST. The commission was credited to the affiliate's
 * wallet by `payAffiliateConversion`; cash for it has to take that credit
 * back, or the same shekel is spent in the shop and paid out. The debit goes
 * through `fn_wallet_transfer` (affiliate wallet -> reserve, reason
 * `affiliate_payout`, idempotency `affiliate_payout:<request id>`), which
 * refuses an insufficient balance and returns the existing entry on a
 * repeat, so a double click moves nothing twice. The status flips only after
 * the transfer succeeded; if the flip fails the next press re-transfers
 * nothing and flips it.
 *
 * The cash itself moves outside this system (bank transfer by the operator);
 * this records that it did. No payment provider.
 */
async function runDecideAffiliatePayout(
  _: PayoutActionState,
  formData: FormData,
): Promise<PayoutActionState> {
  let session: AdminSessionInfo
  try {
    session = await requireSection('affiliates', 'write')
  } catch {
    return { error: 'אין הרשאה' }
  }

  const parsed = decisionSchema.safeParse({
    id: formData.get('id'),
    decision: formData.get('decision'),
    note: formData.get('note') ?? '',
  })
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'קלט לא תקין' }

  const admin = createAdminClient()
  const { data: rowData, error: rowError } = await admin
    .from('affiliate_payout_requests' as never)
    .select('id, affiliate_id, user_id, amount_agorot, status')
    .eq('id', parsed.data.id)
    .maybeSingle()
  if (rowError) {
    if (rowError.code === UNDEFINED_TABLE) return { error: NOT_APPLIED }
    log.error('affiliate_payouts.read_failed', { reason: rowError.message })
    return { error: `קריאת הבקשה נכשלה: ${rowError.message}` }
  }
  if (!rowData) return { error: 'הבקשה לא נמצאה' }
  const row = rowData as unknown as PayoutRow
  if (row.status !== 'pending') return { error: 'הבקשה כבר טופלה' }

  const now = new Date().toISOString()
  let walletEntryId: string | null = null

  if (parsed.data.decision === 'paid') {
    const amount = agorot(Math.round(Number(row.amount_agorot)))
    if (amount <= 0) return { error: 'סכום הבקשה אינו תקין' }

    const [{ data: reserve }, { data: wallet }] = await Promise.all([
      admin.from('wallet_accounts').select('id').eq('code', RESERVE_ACCOUNT_CODE).maybeSingle(),
      admin.from('wallet_accounts').select('id').eq('user_id', row.user_id).maybeSingle(),
    ])
    if (!reserve) return { error: 'חשבון הרזרבה של הפלטפורמה לא נמצא' }
    if (!wallet) return { error: 'לשותף אין ארנק לחיוב' }

    // Shekels at the boundary only: fn_wallet_transfer takes p_amount_ils, and
    // agorotToIls is the one sanctioned conversion (pay.ts uses the same).
    const { data: entryId, error: transferError } = await admin.rpc('fn_wallet_transfer', {
      p_debit_account: wallet.id,
      p_credit_account: reserve.id,
      p_amount_ils: agorotToIls(amount),
      p_reason: AFFILIATE_PAYOUT_REASON,
      p_idempotency: `affiliate_payout:${row.id}`,
    })
    if (transferError) {
      log.warn('affiliate_payouts.transfer_failed', {
        requestId: row.id,
        reason: transferError.message,
      })
      return { error: `חיוב הארנק נכשל: ${transferError.message}` }
    }
    walletEntryId = typeof entryId === 'string' ? entryId : null
  }

  const status = parsed.data.decision === 'paid' ? 'paid' : 'rejected'
  const { data: flipped, error: flipError } = await admin
    .from('affiliate_payout_requests' as never)
    .update({
      status,
      decided_by: session.userId,
      decided_at: now,
      decision_note: parsed.data.note || null,
      wallet_entry_id: walletEntryId,
    } as never)
    .eq('id', row.id)
    .eq('status', 'pending')
    .select('id')
  if (flipError) {
    log.error('affiliate_payouts.status_update_failed', {
      requestId: row.id,
      reason: flipError.message,
    })
    return { error: `עדכון הבקשה נכשל: ${flipError.message}` }
  }
  if (!flipped || (flipped as unknown[]).length === 0) return { error: 'הבקשה כבר טופלה' }

  await writeAuditLog({
    actorId: session.userId,
    actorRole: session.role,
    action: 'status_change',
    entityType: 'affiliate_payout_requests',
    entityId: row.id,
    changes: { status: { from: 'pending', to: status } },
    metadata: {
      affiliate_id: row.affiliate_id,
      amount_agorot: row.amount_agorot,
      wallet_entry_id: walletEntryId,
      note: parsed.data.note || null,
    },
  })

  log.info('affiliate_payouts.decided', { requestId: row.id, status })
  revalidatePath('/admin/affiliates')
  revalidatePath('/account/affiliate')
  revalidatePath('/account/wallet')
  return { success: status === 'paid' ? 'הבקשה סומנה כשולמה והארנק חויב' : 'הבקשה נדחתה' }
}

export async function decideAffiliatePayout(
  _: PayoutActionState,
  formData: FormData,
): Promise<PayoutActionState> {
  return withActionContext('admin.affiliate_payout.decide', () =>
    runDecideAffiliatePayout(_, formData),
  )
}
