import type { ExperimentDefinition } from '@/lib/analytics/experiments'
import type { LandingPage } from '@/lib/landing/blocks'
import { controlVariantKey, landingProperty } from '@/lib/landing/variant'

/**
 * A landing page with two or more variants IS an experiment, in the shape
 * the registry (`analytics/experiments.ts`), the assignment
 * (`experiment-events.ts`) and the stats (`experiment-stats.ts`) already
 * understand. Nothing in the report pipeline knows about landing pages: it
 * receives one of these and treats it exactly like the checkout test.
 *
 * Exposure is the `page_view` of `/lp/<slug>` carrying `$feature/lp_<slug>`
 * (stamped by AnalyticsProvider from `exposure.ts`); the goal is the
 * server-side `purchase`, joined to the exposure by identity. A page with
 * fewer than two arms has nothing to compare and is not an experiment.
 */
export function landingExperiment(page: LandingPage): ExperimentDefinition | null {
  if (page.variants.length < 2) return null
  const property = landingProperty(page.slug)
  return {
    key: `lp_${page.slug}`,
    flag: property.slice('$feature/'.length),
    property,
    variants: page.variants.map((variant) => variant.key),
    control: controlVariantKey(page.variants),
    exposureEvents: ['page_view'],
    goalEvent: 'purchase',
    hypothesisHe: page.hypothesisHe ?? `השוואת גרסאות של דף הנחיתה "${page.titleHe}".`,
    variantLabelsHe: Object.fromEntries(
      page.variants.map((variant, index) => [
        variant.key,
        index === 0 ? `בקרה (${variant.key})` : variant.key,
      ]),
    ),
  }
}

export function landingExperiments(pages: readonly LandingPage[]): ExperimentDefinition[] {
  return pages.flatMap((page) => {
    const experiment = landingExperiment(page)
    return experiment ? [experiment] : []
  })
}
