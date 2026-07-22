import {
  type CreatePaymentInput,
  type CreatePaymentResult,
  type PaymentProvider,
  ProviderNotImplementedError,
  type RefundPaymentInput,
  type RefundPaymentResult,
  type VerifiedWebhookEvent,
} from '@/lib/payments/provider'

/**
 * Payoneer adapter stub. Keeps the PaymentProvider surface compile-green
 * until a live integration is approved (ADR-001).
 */
export class PayoneerPaymentProvider implements PaymentProvider {
  readonly kind = 'payoneer' as const

  async createPayment(_input: CreatePaymentInput): Promise<CreatePaymentResult> {
    throw new ProviderNotImplementedError('payoneer', 'createPayment')
  }

  async refundPayment(_input: RefundPaymentInput): Promise<RefundPaymentResult> {
    throw new ProviderNotImplementedError('payoneer', 'refundPayment')
  }

  async parseAndVerifyWebhook(_rawBody: string, _headers: Headers): Promise<VerifiedWebhookEvent> {
    throw new ProviderNotImplementedError('payoneer', 'parseAndVerifyWebhook')
  }
}
