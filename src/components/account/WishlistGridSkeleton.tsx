/** Skeleton grid for wishlist items during loading */
export default function WishlistCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-xl border border-gray-100 bg-white" aria-hidden="true">
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

          <span className="block h-9 w-20 rounded-lg bg-gray-100" />
        </div>

        <div className="flex gap-2">
          <span className="block h-9 flex-1 rounded-lg bg-gray-100" />
          <span className="block h-9 flex-1 rounded-lg bg-gray-100" />
        </div>
      </div>
    </div>
  )
}

/** Grid of wishlist card skeletons */
export function WishlistGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <ul className="grid gap-3 sm:grid-cols-2" aria-busy="true" aria-label="טוען רשימת משאלות">
      {Array.from({ length: count }, (_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length placeholder
        <li key={i} className="list-none">
          <WishlistCardSkeleton />
        </li>
      ))}
    </ul>
  )
}
