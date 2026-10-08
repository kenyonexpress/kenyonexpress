import { landingPath } from '@/lib/landing/slug'
import { landingProperty } from '@/lib/landing/variant'

/**
 * The landing variant the CURRENT page rendered, handed from the page to
 * the analytics provider without a cookie or a storage key.
 *
 * WHY A MODULE VARIABLE. The exposure event of a landing experiment is the
 * `page_view` AnalyticsProvider already emits on every navigation; a second
 * event would double-count the funnel's first step on exactly the pages
 * whose funnel is being measured. So the page tells this module which
 * variant it painted and the provider asks when it builds the page_view.
 *
 * WHY THE ORDER IS GUARANTEED. `LandingTracker` records the exposure in a
 * layout effect; the provider emits in a passive effect. React runs every
 * layout effect of a commit before any passive effect of that commit, on
 * first load and on a client navigation alike, so the page_view for
 * `/lp/<slug>` always sees the exposure the same commit set. On the way OUT
 * of a landing page the provider's effect runs with the new pathname, and
 * `landingPageViewProps` answers nothing for a pathname that is not the
 * remembered page, so the variant never leaks onto the next route's view.
 *
 * Browser-only state, pure module otherwise: no window access at import.
 */

export type LandingExposure = { slug: string; variant: string }

let current: LandingExposure | null = null

export function setLandingExposure(exposure: LandingExposure): void {
  current = exposure
}

export function clearLandingExposure(): void {
  current = null
}

/** Test seam and admin debugging; the provider uses `landingPageViewProps`. */
export function currentLandingExposure(): LandingExposure | null {
  return current
}

/**
 * The properties a `page_view` for `pathname` carries: the slug, the variant,
 * and the `$feature/lp_<slug>` property the experiment report joins on.
 * Empty for any pathname that is not the remembered landing page.
 */
export function landingPageViewProps(pathname: string): Record<string, string> {
  if (!current || pathname !== landingPath(current.slug)) return {}
  return {
    lp_slug: current.slug,
    lp_variant: current.variant,
    [landingProperty(current.slug)]: current.variant,
  }
}
