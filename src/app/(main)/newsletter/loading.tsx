import RouteLoading from '@/components/error-pages/RouteLoading'

/**
 * Loading state for the newsletter confirm and unsubscribe pages (S33).
 *
 * The (main) group has no group-level loading.tsx because /coupons/[id] lives
 * in it: that page was rebuilt without a Suspense boundary so an unknown id
 * answers 404, and a loading.tsx above it would put the boundary back
 * (measured 06.11.2026: 200 instead of 404). /coupons shares the segment with
 * /coupons/[id], so it cannot take one either; the list brings its own
 * skeleton.
 */
export default function Loading() {
  return <RouteLoading />
}
