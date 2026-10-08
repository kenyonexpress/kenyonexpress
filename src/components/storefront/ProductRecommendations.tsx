import type { Product } from '@/components/ProductCard'
import ProductCard from '@/components/ProductCard'
import { blurForProductImages } from '@/lib/images/blur'
import { attachPriceHistory } from '@/lib/pricing/price-history-read'
import { loadProductStrips } from '@/lib/recommendations/product-strips'
import { stripOrNothing } from '@/lib/recommendations/rules'
import { loadRelatedProducts } from '@/lib/related-products'

interface Props {
  productId: string
  categoryId: string | null
  /** Integer agorot, or null when the row has no integer price. */
  priceAgorot: number | null
}

export const STRIP_TITLES = {
  boughtTogether: 'נקנו יחד',
  viewedTogether: 'לקוחות צפו גם ב',
  related: 'מומלצים',
  similarPrice: 'במחיר דומה',
} as const

type StripKey = keyof typeof STRIP_TITLES

/**
 * The recommendation strips at the foot of a product page (STEP 57).
 *
 * UP TO THREE ROWS, IN SIGNAL ORDER. "נקנו יחד" (paid orders holding both
 * products) first, then "לקוחות צפו גם ב" (PostHog `view_item` baskets), then
 * "במחיר דומה" (the catalogue inside ±25% of this price). No card appears in
 * two rows, and a row with fewer than two cards is not a row
 * (`lib/recommendations/rules.ts` owns both floors).
 *
 * THE OLD STRIP IS THE FALLBACK, NOT A FOURTH ROW. Before this component the
 * page ended on `RelatedProducts` ("מומלצים", same-category siblings). It still
 * does whenever neither behavioural row has enough support, which on the
 * 2026-10-08 production data is every product: one paid order holds two
 * products and three sessions viewed two. A shopper therefore sees exactly
 * yesterday's "מומלצים" plus one new "במחיר דומה" row, and the behavioural rows
 * take the fallback's place only once the data earns them. Everything here
 * sits under the fold at every width, below what the parity gate scores.
 *
 * Every read is `'use cache'` on a cookie-free client (see `sources.ts`), so
 * this component adds no per-request work to the page beyond a cache hit.
 */
export default async function ProductRecommendations({
  productId,
  categoryId,
  priceAgorot,
}: Props) {
  const strips = await loadProductStrips({ id: productId, priceAgorot })
  const rows: { key: StripKey; products: Product[] }[] = []

  if (strips.boughtTogether.length > 0) {
    rows.push({ key: 'boughtTogether', products: strips.boughtTogether })
  }
  if (strips.viewedTogether.length > 0) {
    rows.push({ key: 'viewedTogether', products: strips.viewedTogether })
  }

  let similar: Product[] = strips.similarPrice
  if (rows.length === 0) {
    const related = await loadRelatedProducts(categoryId, productId)
    if (related.length > 0) {
      rows.push({ key: 'related', products: related })
      const shown = new Set(related.map((p) => p.id))
      similar = stripOrNothing(similar.filter((p) => !shown.has(p.id)))
    }
  }
  if (similar.length > 0) rows.push({ key: 'similarPrice', products: similar })

  if (rows.length === 0) return null

  // The history marks on the tiles (STEP 59): one cached read per row, the
  // products back with their summary attached. The cards render nothing
  // without one, so a failed read is a strip without badges, not no strip.
  const marked = await Promise.all(
    rows.map(async (row) => ({ ...row, products: await attachPriceHistory(row.products) })),
  )

  return (
    <>
      {marked.map((row) => (
        <section
          key={row.key}
          className="pdp-related"
          data-strip={row.key}
          aria-labelledby={`pdp-strip-${row.key}`}
        >
          <h2 id={`pdp-strip-${row.key}`} className="pdp-related__title">
            {STRIP_TITLES[row.key]}
          </h2>
          <div className="pdp-related__grid">
            {row.products.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                blurDataURL={blurForProductImages(product.images)}
              />
            ))}
          </div>
        </section>
      ))}
    </>
  )
}
