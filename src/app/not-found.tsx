import NotFoundPage from '@/components/error-pages/NotFoundPage'

/**
 * The 404 for a URL that matches no route, and the fallback for any notFound()
 * in a segment that has no not-found.tsx of its own.
 *
 * There was no not-found.tsx at all, so a missing product, a mistyped category
 * or a dead promo link rendered Next's built-in English page: left-to-right,
 * unstyled, and off-brand in the middle of a Hebrew storefront. The product
 * page alone calls notFound() on every unknown slug, so this is not a rare
 * corner - it is the page a customer sees whenever a link rots.
 *
 * G7: branded through ErrorPageFrame (logo, Electro palette redefined
 * locally, support by mail and WhatsApp).
 *
 * S33: the body moved to NotFoundPage so the route groups can render the same
 * 404 inside their own layouts without a second <main>. Here it keeps `main`:
 * for an unmatched URL no group layout renders, and this is the document.
 */

export const metadata = {
  title: 'הדף לא נמצא',
  robots: { index: false, follow: true },
}

export default function NotFound() {
  return <NotFoundPage />
}
