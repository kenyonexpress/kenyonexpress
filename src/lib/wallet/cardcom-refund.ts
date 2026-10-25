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
  console.warn('Cardcom refund not implemented - admin must process manually')

  return {
    success: false,
    error: 'Cardcom refund API not implemented - process manually via Cardcom dashboard',
  }
}
