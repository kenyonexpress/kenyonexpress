/**
 * Skeleton loader for individual category tile.
 * Matches the structure of CategoryCard to prevent layout shift during streaming.
 */
export default function CategoryTileSkeleton() {
  return (
    <div className="category-card category-card--skeleton" aria-hidden="true">
      <span className="category-skeleton category-skeleton--eyebrow" />
      <span className="category-skeleton category-skeleton--price" />
      <span className="category-skeleton category-skeleton--title" />
      <span className="category-skeleton category-skeleton--thumb" />
      <span className="category-skeleton category-skeleton--footer" />
    </div>
  )
}
