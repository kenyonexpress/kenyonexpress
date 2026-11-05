import RouteLoading from '@/components/error-pages/RouteLoading'

/**
 * Loading state for the public supplier pages (S33). What it covers in practice
 * is /supplier/apply: that page reads the applicant's own row at request time
 * and has no boundary of its own, so this is what stands between the header
 * and the footer while the read is out. /supplier/login keeps its own boundary
 * and /supplier/access-denied is static; neither paints this.
 *
 * Safe at the group root because no page here has a slug that must answer 404,
 * and all three sit outside the index.
 */
export default function Loading() {
  return <RouteLoading />
}
