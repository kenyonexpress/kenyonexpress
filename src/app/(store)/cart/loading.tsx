import RouteLoading from '@/components/error-pages/RouteLoading'

/**
 * Loading state for /cart (S33). Renders inside the store layout, so the header
 * and the mini-cart stay on screen.
 *
 * WHY HERE AND NOT ON THE WHOLE (store) GROUP. A loading.tsx is a Suspense
 * boundary above every page under it, and on this item's builds (06.11.2026)
 * that cost two things, both measured:
 *
 *   1. With one at the group root, /product/<unknown>, /category/<unknown>,
 *      /s/<unknown> and /city/<unknown> answered 200 instead of 404: the
 *      loading shell went out with the status line before notFound() ran. A
 *      soft 404 over an unbounded slug space, the exact thing /category/[slug]
 *      and /coupons/[id] were rebuilt to stop.
 *   2. With one on /search, the prerendered shell painted this generic state
 *      in place of the page's own SearchPageFallback, which is shaped like the
 *      results it stands in for.
 *
 * So the store's one loading state sits on the segment that has no slug to
 * miss and no fallback of its own to displace. /cart is prerendered whole, so
 * this never paints on a first load (measured: absent from the built shell);
 * it shows on a client navigation that has to wait. Checkout has none, on
 * purpose: its return pages answer the payment provider with real redirects,
 * and a boundary above them would turn those into streamed ones.
 */
export default function Loading() {
  return <RouteLoading />
}
