'use client'

import { clearLandingExposure, setLandingExposure } from '@/lib/landing/exposure'
import { useLayoutEffect } from 'react'

/**
 * Tells the analytics provider which landing variant this page painted.
 *
 * A LAYOUT effect, and that is the whole component: React runs every layout
 * effect of a commit before any passive effect of the same commit, and the
 * provider's page_view goes out from a passive effect keyed on the pathname.
 * So on first load and on a client navigation alike, the page_view for
 * `/lp/<slug>` carries the variant this very render chose. The cleanup
 * clears it on the way out, and the provider also refuses to stamp a
 * pathname that is not the remembered one, so a variant never follows the
 * visitor onto the next route.
 *
 * Renders nothing and sends nothing itself: the exposure event is the
 * page_view that already exists, not a second one (lib/landing/exposure.ts).
 */
export default function LandingTracker({ slug, variant }: { slug: string; variant: string }) {
  useLayoutEffect(() => {
    setLandingExposure({ slug, variant })
    return () => clearLandingExposure()
  }, [slug, variant])
  return null
}
