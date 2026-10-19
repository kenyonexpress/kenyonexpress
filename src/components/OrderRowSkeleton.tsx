/**
 * Streaming fallback for order and cart line items.
 *
 * Matches the CartLineItem layout: thumbnail, details, controls.
 * Prevents layout shift when real items stream in.
 */
export default function OrderRowSkeleton() {
  return (
    <article className="cart-line" aria-hidden="true">
      <div className="cart-line__thumb bg-gray-100" />

      <div className="cart-line__body space-y-2">
        <div className="h-4 w-3/4 rounded bg-gray-100" />

        <div className="h-3 w-1/2 rounded bg-gray-100" />

        <div className="h-3 w-1/3 rounded bg-gray-100" />

        <div className="flex items-center justify-between">
          <div className="h-5 w-20 rounded bg-gray-100" />
          <div className="h-5 w-20 rounded bg-gray-100" />
        </div>
      </div>
    </article>
  )
}

/** List of order row skeletons for cart/order pages. */
export function OrderRowsListSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="טוען פריטים">
      {Array.from({ length: count }, (_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length placeholder, never reordered
        <OrderRowSkeleton key={i} />
      ))}
    </div>
  )
}
