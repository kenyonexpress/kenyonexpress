/**
 * Whether the checkout form must refuse with `payment_disabled`.
 *
 * Refuses whenever the `payment_production` flag is off AND either the real
 * provider is configured (no mock) or the deployment is Vercel production. The
 * second clause is the point: the mock provider "completes" a checkout without
 * charging anyone, so on production it would hand out goods for free. Mock may
 * complete a checkout only on preview and dev.
 */
export function isPaymentDisabled(input: {
  useMock: boolean
  paymentProduction: boolean
  vercelEnv: string | undefined
}): boolean {
  if (input.paymentProduction) return false
  return !input.useMock || input.vercelEnv === 'production'
}
