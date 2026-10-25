/**
 * Wallet types (client-safe, no server imports)
 */

export type PayoutRequest = {
  id: string
  user_id: string
  amount_agorot: number
  payout_method: 'bank_transfer' | 'cardcom_refund'
  bank_details: {
    account_number: string
    branch_code: string
    reference_id: string
  } | null
  cardcom_token_id: string | null
  status: 'pending' | 'approved' | 'rejected' | 'completed'
  admin_note: string | null
  requested_at: string
  reviewed_at: string | null
  reviewed_by: string | null
  completed_at: string | null
  rejection_reason: string | null
}
