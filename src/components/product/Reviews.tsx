/**
 * Intentionally renders nothing. The site has no reviews UI (product rule): the
 * submission form, the approved list and the JSON-LD rating were all removed,
 * and the rows are read only in /admin/reviews on the service role.
 */
export default function Reviews(): null {
  return null
}
