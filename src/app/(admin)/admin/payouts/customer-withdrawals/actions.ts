'use server'

import { requireSection } from '@/lib/admin/rbac'
import { withActionContext } from '@/lib/observability/action-context'
import { log } from '@/lib/observability/log'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

async function runApproveWithdrawal(requestId: string) {
  const { userId } = await requireSection('payments', 'write')
  const supabase = await createClient()

  const { error } = await supabase
    .from('customer_wallet_payouts')
    .update({
      status: 'approved',
      reviewed_at: new Date().toISOString(),
      reviewed_by: userId,
    })
    .eq('id', requestId)
    .eq('status', 'pending')

  if (error) {
    log.error('withdrawal.approve_failed', { err: error, request_id: requestId })
    return { success: false, error: 'שגיאה באישור הבקשה' }
  }

  revalidatePath('/admin/payouts/customer-withdrawals')
  return { success: true }
}

async function runRejectWithdrawal(requestId: string, rejectionReason: string) {
  const { userId } = await requireSection('payments', 'write')
  const supabase = await createClient()

  const { error } = await supabase
    .from('customer_wallet_payouts')
    .update({
      status: 'rejected',
      rejection_reason: rejectionReason,
      reviewed_at: new Date().toISOString(),
      reviewed_by: userId,
    })
    .eq('id', requestId)
    .eq('status', 'pending')

  if (error) {
    log.error('withdrawal.reject_failed', { err: error, request_id: requestId })
    return { success: false, error: 'שגיאה בדחיית הבקשה' }
  }

  revalidatePath('/admin/payouts/customer-withdrawals')
  return { success: true }
}

async function runCompleteWithdrawal(requestId: string) {
  await requireSection('payments', 'write')
  const supabase = await createClient()

  // Get the withdrawal request
  const { data: request, error: fetchError } = await supabase
    .from('customer_wallet_payouts')
    .select('*')
    .eq('id', requestId)
    .single()

  if (fetchError || !request) {
    return { success: false, error: 'בקשה לא נמצאה' }
  }

  // For Cardcom refunds, attempt API call
  const { refundWithdrawalToCard } = await import('@/lib/wallet/cardcom-refund')
  const refundResult = await refundWithdrawalToCard(request, `Wallet withdrawal ${requestId}`)
  if (refundResult && !refundResult.success) {
    // Log but continue - admin can process manually via Cardcom dashboard
    log.warn('withdrawal.card_refund_manual', {
      request_id: requestId,
      reason: refundResult.error,
    })
  }

  // Get user and platform wallet accounts
  const { data: userWallet, error: userWalletError } = await supabase
    .from('wallet_accounts')
    .select('id')
    .eq('user_id', request.user_id)
    .single()

  const { data: platformWallet, error: platformWalletError } = await supabase
    .from('wallet_accounts')
    .select('id')
    .eq('owner_type', 'platform')
    .single()

  if (userWalletError || platformWalletError || !userWallet || !platformWallet) {
    if (userWalletError || platformWalletError) {
      log.error('withdrawal.wallet_lookup_failed', {
        err: userWalletError ?? platformWalletError,
        request_id: requestId,
      })
    }
    return { success: false, error: 'לא נמצאו חשבונות ארנק' }
  }

  // Call wallet transfer function to debit user wallet
  const { data: entryId, error: transferError } = await supabase.rpc('fn_wallet_transfer', {
    p_debit_account: userWallet.id,
    p_credit_account: platformWallet.id,
    p_amount_ils: request.amount_agorot / 100,
    p_reason: 'payout_debit',
    p_idempotency: `payout:${requestId}`,
  })

  if (transferError) {
    log.error('withdrawal.wallet_transfer_failed', { err: transferError, request_id: requestId })
    return { success: false, error: 'שגיאה בחיוב הארנק' }
  }

  // Update request status with admin note about payment method
  const { error: updateError } = await supabase
    .from('customer_wallet_payouts')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      wallet_debit_entry_id: entryId,
      admin_note:
        request.payout_method === 'cardcom_refund'
          ? 'Cardcom refund triggered - verify in Cardcom dashboard'
          : 'Manual bank transfer required - process via bank',
    })
    .eq('id', requestId)

  if (updateError) {
    log.error('withdrawal.complete_failed', { err: updateError, request_id: requestId })
    return { success: false, error: 'שגיאה בעדכון הבקשה' }
  }

  revalidatePath('/admin/payouts/customer-withdrawals')
  return { success: true }
}

export async function approveWithdrawal(requestId: string) {
  return withActionContext('admin.withdrawals.approve', () => runApproveWithdrawal(requestId))
}

export async function rejectWithdrawal(requestId: string, rejectionReason: string) {
  return withActionContext('admin.withdrawals.reject', () =>
    runRejectWithdrawal(requestId, rejectionReason),
  )
}

export async function completeWithdrawal(requestId: string) {
  return withActionContext('admin.withdrawals.complete', () => runCompleteWithdrawal(requestId))
}
