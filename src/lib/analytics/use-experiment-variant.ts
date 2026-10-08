'use client'

import type { ExperimentDefinition, VariantOf } from '@/lib/analytics/experiments'
import { getVariant } from '@/lib/analytics/feature-flags'
import { useEffect, useState } from 'react'

/**
 * The variant this browser should render for one registered experiment.
 *
 * CONTROL FIRST, THEN ONE SWITCH. The initial state is the experiment's
 * control on the server and on the client alike, and the session's decision
 * is applied in an effect. Reading the session cache in the state
 * initialiser would be one render faster for a returning tab, but it would
 * also make the client's first render disagree with the server's HTML, and
 * React does not patch a mismatched attribute during hydration: the cached
 * variant would be logged as a hydration error and then NOT applied. The
 * effect runs after hydration, so the switch always lands.
 *
 * The switch happens at most once per session per experiment, on the first
 * view that renders it, within ~2s worst case (the flag fetch's timeout)
 * and within a microtask on every later view, before the visitor has
 * invested anything in the page. A visitor without consent, or with PostHog
 * unconfigured, stays on control with no network call (feature-flags.ts).
 */
export function useExperimentVariant<E extends ExperimentDefinition>(experiment: E): VariantOf<E> {
  const [variant, setVariant] = useState<VariantOf<E>>(experiment.control as VariantOf<E>)

  useEffect(() => {
    let active = true
    void getVariant(experiment).then((resolved) => {
      // Control is already rendered; setting it again would be a no-op
      // update, and a no-op update is still a scheduled one. Only a real
      // variant switches the page.
      if (active && resolved !== experiment.control) setVariant(resolved)
    })
    return () => {
      active = false
    }
  }, [experiment])

  return variant
}
