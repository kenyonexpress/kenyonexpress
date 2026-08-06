import type { Agorot } from '@/lib/commerce/money'

export type PaymentProviderKind = 'cardcom' | 'mock'

export interface CreateLowProfileInput {
  /** Correlation id stored as payments.id or ReturnValue */
  paymentId: string
  orderId: string
  orderNumber: string
  amountAgorot: Agorot
  currency?: 'ILS'
  saveToken: boolean
  successRedirectUrl: string
  failedRedirectUrl: string
  webhookUrl: string
  description: string
}

export interface CreateLowProfileResult {
  lowProfileId: string
  redirectUrl: string
  raw: Record<string, unknown>
}

export interface ChargeWithTokenInput {
  paymentId: string
  orderId: string
  amountAgorot: Agorot
  cardcomToken: string
  description: string
}

export interface ChargeWithTokenResult {
  success: boolean
  transactionId: string | null
  failureCode: string | null
  failureMessage: string | null
  token?: {
    token: string
    last4: string
    brand: string
    expiryMonth: number
    expiryYear: number
  }
  raw: Record<string, unknown>
}

export interface RefundInput {
  /** Cardcom transaction id (InternalDealNumber) of the ORIGINAL successful charge. */
  transactionId: string
  /** Full amount of the original charge, in agorot. */
  amountAgorot: Agorot
  /** Partial refund in agorot; omit for a full refund of `amountAgorot`. */
  partialAmountAgorot?: Agorot
  /**
   * Cancel the deal before it is transmitted to the clearing house instead of
   * crediting it. Same money back to the customer, but no money movement on the
   * clearing side and therefore no clearing commission. Only legal on the day of
   * the charge; the caller decides, not this client.
   */
  cancelOnly?: boolean
  description: string
}

export interface RefundResult {
  success: boolean
  /** Cardcom transaction id of the NEW refund deal. */
  refundTransactionId: string | null
  /** Amount actually refunded, in agorot. */
  refundedAgorot: Agorot | null
  failureCode: string | null
  failureMessage: string | null
  raw: Record<string, unknown>
}

export interface VerifyLowProfileResult {
  success: boolean
  amountAgorot: Agorot | null
  transactionId: string | null
  lowProfileId: string
  token?: {
    token: string
    last4: string
    brand: string
    expiryMonth: number
    expiryYear: number
  }
  raw: Record<string, unknown>
}

export interface PaymentProvider {
  readonly name: PaymentProviderKind
  createLowProfile(input: CreateLowProfileInput): Promise<CreateLowProfileResult>
  chargeWithToken(input: ChargeWithTokenInput): Promise<ChargeWithTokenResult>
  verifyLowProfile(lowProfileId: string): Promise<VerifyLowProfileResult>
  refundByTransactionId(input: RefundInput): Promise<RefundResult>
}
