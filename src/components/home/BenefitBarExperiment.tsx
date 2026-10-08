'use client'

import { HOME_HERO_EXPERIMENT } from '@/lib/analytics/experiments'
import { useExperimentVariant } from '@/lib/analytics/use-experiment-variant'
import type { ReactNode } from 'react'

/**
 * The `no_benefit_bar` arm of the homepage experiment (STEP 66). Wraps the
 * server-rendered BenefitBar and unmounts it once the session's decision
 * says so; control, the server's HTML and every visitor without consent
 * render the children untouched, which is what the comparison gate measures.
 *
 * Children, not a re-implementation: BenefitBar is a server component with
 * the live site's strings and the measured tokens, and the experiment only
 * decides whether the strip is there.
 */
export default function BenefitBarExperiment({ children }: { children: ReactNode }) {
  const variant = useExperimentVariant(HOME_HERO_EXPERIMENT)
  if (variant === 'no_benefit_bar') return null
  return children
}
