import { type CardcomEnv, loadCardcomEnv } from '@/lib/payments/env'

/**
 * Whether the checkout may take money right now.
 *
 * Two flags already existed and were read in two different places, which is
 * how production once finalized orders with no card charged: `checkoutEnabled`
 * was true, and `useMock` was ALSO true, and nothing asked both questions at
 * once. This module asks them together and is the one answer the page, the
 * submit button and the server action all read.
 *
 * The rules, and why each is what it is:
 *
 * CHECKOUT_DISABLED   `CHECKOUT_ENABLED` is not `true` in production, or is
 *                     `false` elsewhere. The operator's own off switch.
 * MOCK_IN_PRODUCTION  The mock provider is selected while NODE_ENV is
 *                     production. The mock "approves" every charge, so a live
 *                     storefront on it hands out goods for free. Outside
 *                     production the mock is the normal way to run a checkout
 *                     on a laptop and is not a reason to close anything.
 *
 * Credentials are not a rule here because `loadCardcomEnv` already throws on
 * a missing one outside mock mode; `readPaymentProviderGate` turns that throw
 * into a closed gate with its own reason rather than a 500 on the page.
 */

export type PaymentGateReason = 'CHECKOUT_DISABLED' | 'MOCK_IN_PRODUCTION' | 'ENV_INCOMPLETE'

export type PaymentProviderGate = {
  /** True when a real charge can be taken. Everything else on the page keys off this. */
  live: boolean
  reasons: PaymentGateReason[]
}

/**
 * The one way past MOCK_IN_PRODUCTION, and it cannot be taken on Vercel.
 *
 * `next start` on a laptop is NODE_ENV=production, so the E2E money specs
 * (full-purchase-redeem, physical-purchase, admin-refund), which the repo
 * insists run against the built app, met a closed gate and timed out on a
 * pay button that read "התשלום ייפתח בקרוב" (measured 15.10.2026, XF04).
 * `E2E_MOCK_CHECKOUT=local-build` opens the gate for the mock provider ONLY
 * when `VERCEL` is unset: every Vercel runtime sets VERCEL=1, so the variable
 * is inert on the deployed site whatever its value there.
 */
export const E2E_MOCK_CHECKOUT_VALUE = 'local-build'

export function mockAllowedInProductionBuild(source: Record<string, string | undefined>): boolean {
  return source.E2E_MOCK_CHECKOUT === E2E_MOCK_CHECKOUT_VALUE && !source.VERCEL
}

export function assessPaymentProviderGate(
  env: Pick<CardcomEnv, 'checkoutEnabled' | 'useMock'>,
  nodeEnv: string | undefined = process.env.NODE_ENV,
  allowMockInProductionBuild = false,
): PaymentProviderGate {
  const reasons: PaymentGateReason[] = []
  if (!env.checkoutEnabled) reasons.push('CHECKOUT_DISABLED')
  if (nodeEnv === 'production' && env.useMock && !allowMockInProductionBuild)
    reasons.push('MOCK_IN_PRODUCTION')
  return { live: reasons.length === 0, reasons }
}

/**
 * The gate for the running process. Never throws: a page that cannot decide
 * whether payment is live must render "not yet", not an error.
 */
export function readPaymentProviderGate(
  source: NodeJS.ProcessEnv = process.env,
): PaymentProviderGate {
  try {
    return assessPaymentProviderGate(
      loadCardcomEnv(source),
      source.NODE_ENV,
      mockAllowedInProductionBuild(source),
    )
  } catch {
    return { live: false, reasons: ['ENV_INCOMPLETE'] }
  }
}

/** The one sentence the shopper reads when the gate is closed. Same for every reason on purpose: which variable is unset is not theirs to know. */
export const PAYMENT_GATE_CLOSED_MESSAGE =
  'התשלום באתר עדיין לא פעיל. אפשר למלא את הפרטים, והתשלום ייפתח ברגע שספק הסליקה יאושר.'
