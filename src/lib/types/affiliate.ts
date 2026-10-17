// Affiliate program types

export interface AffiliateAccount {
  id: number
  user_id: string
  affiliate_code: string
  commission_rate: number // basis points
  status: 'active' | 'inactive' | 'suspended' | 'pending_verification'
  total_clicks: number
  total_attributed_orders: number
  total_commissions: number // agorot
  total_paid_out: number // agorot
  pending_balance: number // agorot
  verification_document_url?: string
  bank_account_id?: number
  created_at: string
  updated_at: string
}

export interface AffiliateLink {
  id: number
  affiliate_id: number
  utm_source: string
  utm_medium: string
  utm_campaign?: string
  name?: string
  created_at: string
}

export interface AffiliateClick {
  id: number
  affiliate_id: number
  session_id: string
  product_id?: number
  category_id?: number
  ip_address?: string
  user_agent?: string
  referrer?: string
  created_at: string
  expires_at: string
}

export interface AffiliateOrder {
  id: number
  affiliate_id: number
  order_id: number
  attributed_at: string
  order_total: number // agorot
  commission_amount: number // agorot
  status: 'attributed' | 'confirmed' | 'paid' | 'refunded'
  refund_amount: number // agorot
  created_at: string
  updated_at: string
}

export interface AffiliateCommission {
  id: number
  affiliate_id: number
  affiliate_order_id?: number
  amount: number // agorot
  reason: 'sale' | 'refund' | 'adjustment'
  reference_id?: string
  created_at: string
}

export interface AffiliatePayout {
  id: number
  affiliate_id: number
  amount: number // agorot
  status: 'pending' | 'processing' | 'completed' | 'failed'
  bank_account_id?: number
  payment_method: string
  external_reference?: string
  requested_at: string
  processed_at?: string
  failure_reason?: string
  created_at: string
  updated_at: string
}

export interface AffiliateStats {
  affiliate_code: string
  total_clicks: number
  total_attributed_orders: number
  conversion_rate: number // percentage
  total_commissions: number // agorot
  total_paid_out: number // agorot
  pending_balance: number // agorot
  average_order_value: number // agorot
}

export interface AffiliateSignupInput {
  commission_rate?: number // optional, defaults to 500 (5%)
}
