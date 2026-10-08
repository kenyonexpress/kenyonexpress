'use client'

import type { CheckoutVariant } from '@/lib/analytics/checkout-variant'
import { CHECKOUT_EXPERIMENT } from '@/lib/analytics/experiments'
import { useExperimentVariant } from '@/lib/analytics/use-experiment-variant'

/**
 * The checkout variant this browser should render: the generic hook
 * (lib/analytics/use-experiment-variant.ts) over the checkout entry of the
 * registry. Control at first paint, one switch when the session's decision
 * is known (within ~2s, worst case, on the first checkout view of a session;
 * a microtask on every later one), then session-sticky.
 *
 * Rendering hangs off `data-checkout-variant` on the form root rather than
 * conditional JSX, so a variant is a stylesheet concern until an experiment
 * genuinely needs different markup.
 */
export function useCheckoutVariant(): CheckoutVariant {
  return useExperimentVariant(CHECKOUT_EXPERIMENT)
}
