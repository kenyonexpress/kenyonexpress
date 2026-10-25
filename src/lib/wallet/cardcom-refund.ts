import { log } from '@/lib/observability/log'

export interface CardcomRefundParams {
  tokenId: string
  amountAgorot: number
  orderId?: string
  description?: string
}

export interface CardcomRefundResult {
  success: boolean
  transactionId?: string
  error?: string
}

/**
 * Process a Cardcom refund to a saved payment method
 *
 * NOTE: This is a placeholder for the actual Cardcom refund API integration.
 * Production implementation requires:
 * 1. Cardcom Terminal credentials (loaded from env)
 * 2. Call to Cardcom refund API endpoint
 * 3. Proper error handling and retry logic
 * 4. Transaction logging
 */
export async function processCardcomRefund(
  _params: CardcomRefundParams,
): Promise<CardcomRefundResult> {
  // TODO: Production implementation
  // 1. Load Cardcom credentials from environment
  // 2. Call Cardcom API to process refund
  // 3. Log transaction
  // 4. Return result

  // Placeholder - in production this would call Cardcom API
  log.warn('cardcom_refund_not_implemented')

  return {
    success: false,
    error: 'Cardcom refund API not implemented - process manually via Cardcom dashboard',
  }
}

/**
 * Refund a withdrawal request to its saved card, when it asked for one.
 *
 * Lives here, server-only, so the admin action that renders in the app tree
 * never has to name the column that points at the stored card.
 * Returns null when the request is not a card refund.
 */
export async function refundWithdrawalToCard(
  request: {
    payout_method: string
    cardcom_token_id: string | null
    amount_agorot: number
  },
  description: string,
): Promise<CardcomRefundResult | null> {
  if (request.payout_method !== 'cardcom_refund' || !request.cardcom_token_id) return null
  return processCardcomRefund({
    tokenId: request.cardcom_token_id,
    amountAgorot: request.amount_agorot,
    description,
  })
}
