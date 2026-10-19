/** Skeleton for a single coupon item */
function CouponItemSkeleton() {
  return (
    <div className="account-row" aria-hidden="true">
      <div className="account-row__main space-y-2">
        <span className="block h-6 w-32 rounded bg-gray-100 font-mono" />
        <span className="block h-5 w-40 rounded bg-gray-100" />
        <div className="space-y-1">
          <span className="block h-4 w-48 rounded bg-gray-100" />
          <span className="block h-4 w-44 rounded bg-gray-100" />
        </div>
      </div>
      <div className="account-row__actions">
        <span className="block h-9 w-32 rounded bg-gray-100" />
      </div>
    </div>
  )
}

/** Skeleton grid for coupon list during loading */
export default function CouponListSkeleton({ count = 3 }: { count?: number }) {
  return (
    <section className="account-card space-y-4" aria-busy="true" aria-label="טוען רשימת קופונים">
      {Array.from({ length: count }, (_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length placeholder
        <CouponItemSkeleton key={i} />
      ))}
    </section>
  )
}
