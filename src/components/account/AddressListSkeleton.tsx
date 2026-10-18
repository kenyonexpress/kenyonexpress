/** Skeleton for a single address item */
function AddressItemSkeleton() {
  return (
    <div className="rounded border border-gray-200 p-4" aria-hidden="true">
      <div className="space-y-3">
        <div className="flex items-start justify-between">
          <div className="flex-1 space-y-2">
            <span className="block h-4 w-1/3 rounded bg-gray-100" />
            <span className="block h-4 w-1/2 rounded bg-gray-100" />
          </div>
          <span className="block h-8 w-20 rounded bg-gray-100" />
        </div>
        <span className="block h-4 w-2/3 rounded bg-gray-100" />
        <span className="block h-4 w-1/2 rounded bg-gray-100" />
        <div className="flex gap-2">
          <span className="block h-8 w-20 rounded bg-gray-100" />
          <span className="block h-8 w-20 rounded bg-gray-100" />
        </div>
      </div>
    </div>
  )
}

/** Skeleton grid for address list during loading */
export default function AddressListSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="טוען רשימת כתובות">
      {Array.from({ length: count }, (_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length placeholder
        <AddressItemSkeleton key={i} />
      ))}
    </div>
  )
}
