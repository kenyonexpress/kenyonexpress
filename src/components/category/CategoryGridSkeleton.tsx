/**
 * Streaming fallback for the archive grid.
 *
 * The shell (breadcrumb, title, control bar, filter sidebar) is static and can
 * paint immediately; only the product query is slow. This placeholder holds the
 * exact measured card geometry so the layout does not jump when the real grid
 * streams in.
 *
 * UX27: the boxes are `.ke-skeleton` (globals.css), the one skeleton colour
 * and sweep the whole site uses; `.category-skeleton--*` keeps only the
 * card's measured sizes. `CategoryCardSkeleton` is the single card, so the
 * archive's continuous mode can append a page of them to the live list while
 * the next page is fetched (`CatalogGrid`).
 */
export function CategoryCardSkeleton() {
  return (
    <div className="category-card category-card--skeleton" aria-hidden="true">
      <span className="ke-skeleton category-skeleton category-skeleton--eyebrow" />
      <span className="ke-skeleton category-skeleton category-skeleton--price" />
      <span className="ke-skeleton category-skeleton category-skeleton--title" />
      <span className="ke-skeleton category-skeleton category-skeleton--thumb" />
      <span className="ke-skeleton category-skeleton category-skeleton--footer" />
    </div>
  )
}

export default function CategoryGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <ul className="category-products" aria-busy="true" aria-label="טוען מוצרים">
      {Array.from({ length: count }, (_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length placeholder, never reordered
        <li key={i} className="category-products__item">
          <CategoryCardSkeleton />
        </li>
      ))}
    </ul>
  )
}
