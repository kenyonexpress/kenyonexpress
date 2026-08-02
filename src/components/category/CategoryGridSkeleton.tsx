/**
 * Streaming fallback for the archive grid.
 *
 * The shell (breadcrumb, title, control bar, filter sidebar) is static and can
 * paint immediately; only the product query is slow. This placeholder holds the
 * exact measured card geometry so the layout does not jump when the real grid
 * streams in.
 */
export default function CategoryGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <ul className="category-products" aria-busy="true" aria-label="טוען מוצרים">
      {Array.from({ length: count }, (_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length placeholder, never reordered
        <li key={i} className="category-products__item">
          <div className="category-card category-card--skeleton">
            <span className="category-skeleton category-skeleton--eyebrow" />
            <span className="category-skeleton category-skeleton--price" />
            <span className="category-skeleton category-skeleton--title" />
            <span className="category-skeleton category-skeleton--thumb" />
            <span className="category-skeleton category-skeleton--footer" />
          </div>
        </li>
      ))}
    </ul>
  )
}
