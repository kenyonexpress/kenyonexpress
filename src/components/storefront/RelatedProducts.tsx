import ProductCard from '@/components/ProductCard'
import { loadRelatedProducts } from '@/lib/related-products'

interface Props {
  categoryId: string | null
  excludeId: string
}

/**
 * Server component: shows up to 4 related products, preferring the same
 * category and filling with other recent products when the category is sparse.
 *
 * The query lives in `lib/related-products.ts` behind `use cache`. Read the
 * note there before moving it back up here: this component reading through
 * `createClient()` was the product page's entire per-request cost.
 */
export default async function RelatedProducts({ categoryId, excludeId }: Props) {
  const products = await loadRelatedProducts(categoryId, excludeId)
  if (products.length === 0) return null

  return (
    <section className="pdp-related">
      <h2 className="pdp-related__title">מומלצים</h2>
      <div className="pdp-related__grid">
        {products.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>
    </section>
  )
}
