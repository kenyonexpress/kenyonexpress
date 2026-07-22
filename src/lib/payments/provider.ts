import type { Agorot } from '@/lib/commerce/money'

/** Swappable checkout PSP kinds (ARCHITECTURE-CHECKOUT.md). */
export type CheckoutProviderKind = 'stripe' | 'payoneer' | 'mock'

export type PaymentStatus = 'requires_action' | 'processing' | 'succeeded' | 'failed' | 'canceled'

export type CreatePaymentInput = {
  orderId: string
  paymentAttemptId: string
  amountAgorot: Agorot
  currency: 'ILS'
  idempotencyKey: string
  description: string
  customerEmail?: string
  metadata?: Record<string, string>
  successUrl: string
  cancelUrl: string
}

export type CreatePaymentResult = {
  providerPaymentId: string
  clientSecret: string | null
  redirectUrl: string | null
  status: PaymentStatus
  raw: Record<string, unknown>
}

export type RefundPaymentInput = {
  providerPaymentId: string
  amountAgorot?: Agorot
  idempotencyKey: string
  reason?: string
}

export type RefundPaymentResult = {
  providerRefundId: string
  status: 'succeeded' | 'pending' | 'failed'
  raw: Record<string, unknown>
}

export type VerifiedWebhookEvent = {
  providerEventId: string
  type: string
  /** PaymentIntent / charge id when applicable */
  providerPaymentId: string | null
  orderId: string | null
  paymentAttemptId: string | null
  livemode: boolean
  raw: Record<string, unknown>
}

export class ProviderNotImplementedError extends Error {
  readonly kind: CheckoutProviderKind

  constructor(kind: CheckoutProviderKind, method: string) {
    super(`Payment provider "${kind}" does not implement ${method}`)
    this.name = 'ProviderNotImplementedError'
    this.kind = kind
  }
}

/**
 * Provider-agnostic checkout rail. Application code must depend on this
 * interface only (never import Stripe SDK outside src/lib/payments/stripe/).
 */
export interface PaymentProvider {
  readonly kind: CheckoutProviderKind
  createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult>
  refundPayment(input: RefundPaymentInput): Promise<RefundPaymentResult>
  parseAndVerifyWebhook(rawBody: string, headers: Headers): Promise<VerifiedWebhookEvent>
}
