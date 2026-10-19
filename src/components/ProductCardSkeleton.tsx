/**
 * Streaming fallback for product grids (deals and category).
 *
 * Mirrors the layout and spacing of DefaultProductCard to prevent layout shift
 * when real products stream in. Each skeleton uses the same dimensions as the
 * real card: square image, spacing, typography sizing.
 */
export default function ProductCardSkeleton() {
  return (
    <div
      className="overflow-hidden border border-gray-100 bg-white [border-radius:var(--radius-card)]"
      aria-hidden="true"
    >
      <div className="space-y-2 p-3">
        <p>
          <span className="block h-3 w-1/3 rounded bg-gray-100" />
        </p>

        <p>
          <span className="block h-4 w-4/5 rounded bg-gray-100" />
        </p>

        <div className="relative aspect-square items-center justify-center overflow-hidden bg-gray-100" />

        <div className="flex items-center justify-between gap-2">
          <div className="flex items-baseline gap-2">
            <span className="block h-5 w-12 rounded bg-gray-100" />
          </div>

          <span className="block h-9 w-20 [border-radius:var(--radius-button)] bg-gray-100" />
        </div>
      </div>
    </div>
  )
}

/** Grid of product card skeletons matching the real grid layout. */
export function ProductsGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div
      className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3"
      aria-busy="true"
      aria-label="טוען מוצרים"
    >
      {Array.from({ length: count }, (_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length placeholder, never reordered
        <ProductCardSkeleton key={i} />
      ))}
    </div>
  )
}
