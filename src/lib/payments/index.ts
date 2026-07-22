import { loadCheckoutPaymentsEnv } from '@/lib/payments/checkout-env'
import { getSharedMockCheckoutProvider } from '@/lib/payments/mock-checkout'
import { PayoneerPaymentProvider } from '@/lib/payments/payoneer/provider'
import type { PaymentProvider } from '@/lib/payments/provider'
import { StripePaymentProvider } from '@/lib/payments/stripe/provider'

// Legacy Cardcom rail (still used by existing beginCheckout until Stripe wiring lands)
import { CardcomProvider } from '@/lib/payments/cardcom'
import { loadCardcomEnv } from '@/lib/payments/env'
import { getSharedMockCardcom } from '@/lib/payments/mock-cardcom'
import type { PaymentProvider as CardcomPaymentProvider } from '@/lib/payments/types'

export type { PaymentProvider, CheckoutProviderKind } from '@/lib/payments/provider'
export {
  ProviderNotImplementedError,
  type CreatePaymentInput,
  type CreatePaymentResult,
  type RefundPaymentInput,
  type RefundPaymentResult,
  type VerifiedWebhookEvent,
} from '@/lib/payments/provider'
export { loadCheckoutPaymentsEnv } from '@/lib/payments/checkout-env'
export {
  MockCheckoutPaymentProvider,
  getSharedMockCheckoutProvider,
  resetSharedMockCheckoutProvider,
} from '@/lib/payments/mock-checkout'
export { StripePaymentProvider } from '@/lib/payments/stripe/provider'
export { PayoneerPaymentProvider } from '@/lib/payments/payoneer/provider'
export { resetStripeClientForTests } from '@/lib/payments/stripe/client'

export type { PaymentProvider as CardcomPaymentProvider } from '@/lib/payments/types'
export { verifyCardcomSignature, signCardcomBody } from '@/lib/payments/hmac'
export { loadCardcomEnv } from '@/lib/payments/env'
export { MockCardcomProvider, getSharedMockCardcom } from '@/lib/payments/mock-cardcom'
export { CardcomProvider } from '@/lib/payments/cardcom'

/** Swappable checkout PSP (Stripe / Payoneer stub / mock). */
export function getCheckoutPaymentProvider(
  source: NodeJS.ProcessEnv = process.env,
): PaymentProvider {
  const env = loadCheckoutPaymentsEnv(source)
  if (env.provider === 'mock') return getSharedMockCheckoutProvider()
  if (env.provider === 'payoneer') return new PayoneerPaymentProvider()
  if (!env.stripe) {
    throw new Error('Stripe env missing for PAYMENT_PROVIDER=stripe')
  }
  return new StripePaymentProvider(env.stripe)
}

/**
 * @deprecated Prefer getCheckoutPaymentProvider. Kept for Cardcom webhook/beginCheckout.
 */
export function getPaymentProvider(): CardcomPaymentProvider {
  const env = loadCardcomEnv()
  if (env.useMock) return getSharedMockCardcom()
  return new CardcomProvider()
}
