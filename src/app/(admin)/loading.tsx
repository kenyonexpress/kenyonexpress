import RouteLoading from '@/components/error-pages/RouteLoading'

/**
 * Loading state for the admin panel (S33). The panel frame has its own
 * fallback one level up (AdminFrameFallback, which covers the session check);
 * this one covers the page inside a frame that is already drawn.
 */
export default function Loading() {
  return <RouteLoading panel />
}
