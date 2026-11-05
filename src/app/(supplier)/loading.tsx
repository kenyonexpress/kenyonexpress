import RouteLoading from '@/components/error-pages/RouteLoading'

/**
 * Loading state for the supplier panel (S33). Like the admin group, the frame
 * has its own fallback one level up; this covers the page inside it. Kept small
 * on purpose: a supplier at a till should see the panel, not a full-screen
 * placeholder, while the next screen loads.
 */
export default function Loading() {
  return <RouteLoading panel />
}
