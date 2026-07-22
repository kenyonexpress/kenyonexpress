import type { StripeEnv } from '@/lib/payments/checkout-env'
import Stripe from 'stripe'

let singleton: Stripe | null = null

export function getStripeClient(env: StripeEnv): Stripe {
  if (singleton) return singleton
  singleton = new Stripe(env.secretKey, {
    apiVersion: '2025-08-27.basil',
    typescript: true,
  })
  return singleton
}

/** Test helper: reset cached client between suites. */
export function resetStripeClientForTests(): void {
  singleton = null
}
