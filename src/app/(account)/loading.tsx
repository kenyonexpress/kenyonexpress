import RouteLoading from '@/components/error-pages/RouteLoading'

/**
 * Loading state for the account area (S33).
 *
 * The account layout already wraps its children in a Suspense boundary whose
 * fallback is an empty `.account-content__pending` box: it holds the content
 * column at the nav's measured height so the footer is not drawn under an empty
 * column and then pushed away (V08, CLS 0.41 before it). This file is the
 * nearer boundary, so it is the one that shows, and it keeps that same box and
 * only puts something readable inside it.
 */
export default function Loading() {
  return (
    <div className="account-content__pending">
      <RouteLoading panel />
    </div>
  )
}
