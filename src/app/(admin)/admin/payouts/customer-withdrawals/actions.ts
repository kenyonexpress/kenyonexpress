'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function approveWithdrawal(requestId: string) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { success: false, error: 'נדרשת התחברות' }
  }

  const { error } = await supabase
    .from('customer_wallet_payouts')
    .update({
      status: 'approved',
      reviewed_at: new Date().toISOString(),
      reviewed_by: user.id,
    })
    .eq('id', requestId)
    .eq('status', 'pending')

  if (error) {
    console.error('Failed to approve withdrawal:', error)
    return { success: false, error: 'שגיאה באישור הבקשה' }
  }

  revalidatePath('/admin/payouts/customer-withdrawals')
  return { success: true }
}

export async function rejectWithdrawal(requestId: string, rejectionReason: string) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { success: false, error: 'נדרשת התחברות' }
  }

  const { error } = await supabase
    .from('customer_wallet_payouts')
    .update({
      status: 'rejected',
      rejection_reason: rejectionReason,
      reviewed_at: new Date().toISOString(),
      reviewed_by: user.id,
    })
    .eq('id', requestId)
    .eq('status', 'pending')

  if (error) {
    console.error('Failed to reject withdrawal:', error)
    return { success: false, error: 'שגיאה בדחיית הבקשה' }
  }

  revalidatePath('/admin/payouts/customer-withdrawals')
  return { success: true }
}

export async function completeWithdrawal(requestId: string) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { success: false, error: 'נדרשת התחברות' }
  }

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
  if (request.payout_method === 'cardcom_refund' && request.cardcom_token_id) {
    const { processCardcomRefund } = await import('@/lib/wallet/cardcom-refund')
    const refundResult = await processCardcomRefund({
      tokenId: request.cardcom_token_id,
      amountAgorot: request.amount_agorot,
      description: `Wallet withdrawal ${requestId}`,
    })

    if (!refundResult.success) {
      // Log but continue - admin can process manually via Cardcom dashboard
      console.warn('Cardcom refund failed, admin must process manually:', refundResult.error)
    }
  }

  // Get user and platform wallet accounts
  const { data: userWallet } = await supabase
    .from('wallet_accounts')
    .select('id')
    .eq('user_id', request.user_id)
    .single()

  const { data: platformWallet } = await supabase
    .from('wallet_accounts')
    .select('id')
    .eq('owner_type', 'platform')
    .single()

  if (!userWallet || !platformWallet) {
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
    console.error('Failed to transfer wallet funds:', transferError)
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
    console.error('Failed to complete withdrawal:', updateError)
    return { success: false, error: 'שגיאה בעדכון הבקשה' }
  }

  revalidatePath('/admin/payouts/customer-withdrawals')
  return { success: true }
}
