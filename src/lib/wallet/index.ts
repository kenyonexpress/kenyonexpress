/**
 * Wallet utilities for customer balance, transactions, and withdrawal requests
 */

import { createClient } from '@/lib/supabase/server'

export type { PayoutRequest } from './types'
import type { PayoutRequest } from './types'

// Re-export display functions for convenience
export {
  formatPayoutMethod,
  formatPayoutStatus,
  formatWalletAmount,
  getPayoutStatusVariant,
} from './display'

/**
 * Create a withdrawal (payout) request
 */
export async function createWithdrawalRequest(params: {
  userId: string
  amountAgorot: number
  payoutMethod: 'bank_transfer' | 'cardcom_refund'
  bankDetails?: {
    account_number: string
    branch_code: string
    reference_id: string
  }
  cardcomTokenId?: string
}): Promise<{ success: boolean; error?: string; requestId?: string }> {
  const supabase = await createClient()

  // Validate minimum amount (50 ILS = 5000 agorot)
  if (params.amountAgorot < 5000) {
    return { success: false, error: 'מינימום משיכה: 50 ₪' }
  }

  // Check user balance
  const { data: walletData } = await supabase
    .from('wallet_accounts')
    .select('balance_agorot')
    .eq('user_id', params.userId)
    .single()

  const balance = walletData?.balance_agorot ?? 0
  if (balance < params.amountAgorot) {
    return { success: false, error: 'יתרה לא מספיקה בארנק' }
  }

  // Validate method-specific requirements
  if (params.payoutMethod === 'bank_transfer' && !params.bankDetails) {
    return { success: false, error: 'נדרשים פרטי חשבון בנק' }
  }

  if (params.payoutMethod === 'cardcom_refund' && !params.cardcomTokenId) {
    return { success: false, error: 'נדרש אמצעי תשלום שמור' }
  }

  const { data, error } = await supabase
    .from('customer_wallet_payouts')
    .insert({
      user_id: params.userId,
      amount_agorot: params.amountAgorot,
      payout_method: params.payoutMethod,
      bank_details: params.bankDetails || null,
      cardcom_token_id: params.cardcomTokenId || null,
      status: 'pending',
    })
    .select('id')
    .single()

  if (error) {
    console.error('Failed to create withdrawal request:', error)
    return { success: false, error: 'שגיאה ביצירת בקשת משיכה' }
  }

  return { success: true, requestId: data.id }
}

/**
 * Get user's withdrawal requests
 */
export async function getWithdrawalRequests(userId: string): Promise<PayoutRequest[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('customer_wallet_payouts')
    .select('*')
    .eq('user_id', userId)
    .order('requested_at', { ascending: false })

  if (error) {
    console.error('Failed to fetch withdrawal requests:', error)
    return []
  }

  return (data ?? []) as PayoutRequest[]
}

/**
 * Get all pending withdrawal requests (admin)
 */
export async function getPendingWithdrawals(): Promise<
  Array<
    PayoutRequest & {
      user_email: string
      user_name: string | null
    }
  >
> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('customer_wallet_payouts')
    .select(
      `
      *,
      profiles!customer_wallet_payouts_user_id_fkey(email, full_name)
    `,
    )
    .eq('status', 'pending')
    .order('requested_at', { ascending: true })

  if (error) {
    console.error('Failed to fetch pending withdrawals:', error)
    return []
  }

  return (data ?? []).map((row) => ({
    ...row,
    user_email: (row.profiles as any)?.email ?? '',
    user_name: (row.profiles as any)?.full_name ?? null,
  })) as any
}
