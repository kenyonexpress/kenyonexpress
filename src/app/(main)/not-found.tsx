import NotFoundPage from '@/components/error-pages/NotFoundPage'

/**
 * The 404 for a notFound() thrown under this group: /coupons/[id].
 *
 * It renders inside the group's layout, which already has the page's <main>,
 * so the shared 404 is asked for a <div> (S33; see NotFoundPage). It changes
 * the landmark and nothing else: the status is still 404, and the root
 * not-found.tsx still answers a URL that matches no route.
 */
export default function NotFound() {
  return <NotFoundPage as="div" />
}
