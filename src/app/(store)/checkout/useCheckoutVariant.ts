'use client'

import { type CheckoutVariant, cachedCheckoutVariant } from '@/lib/analytics/checkout-variant'
import { getCheckoutVariant } from '@/lib/analytics/feature-flags'
import { useEffect, useState } from 'react'

/**
 * The checkout variant this browser should render.
 *
 * Starts from the session cache so a shopper who already saw a variant this
 * session gets it at first paint with no flicker; otherwise renders control
 * and switches once (within ~2s, worst case) when PostHog answers. The
 * decision is then session-sticky, so the switch can happen at most once per
 * session, on the first checkout view, before the shopper has invested
 * anything in the page.
 *
 * Rendering hangs off `data-checkout-variant` on the form root rather than
 * conditional JSX, so a variant is a stylesheet concern until an experiment
 * genuinely needs different markup.
 */
export function useCheckoutVariant(): CheckoutVariant {
  const [variant, setVariant] = useState<CheckoutVariant>(
    () => cachedCheckoutVariant() ?? 'control',
  )

  useEffect(() => {
    let active = true
    void getCheckoutVariant().then((resolved) => {
      if (active) setVariant(resolved)
    })
    return () => {
      active = false
    }
  }, [])

  return variant
}
