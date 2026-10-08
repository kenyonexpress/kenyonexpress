import 'server-only'

import { log } from '@/lib/observability/log'
import {
  STRIP_SIZE,
  basketsFromRows,
  buildCooccurrence,
  dedupeStrips,
  neighboursOf,
  priceBand,
  rankBySimilarPrice,
} from './rules'
import {
  type RecommendedProduct,
  loadBoughtTogetherRows,
  loadPriceBandCandidates,
  loadProductsByIds,
  loadViewedTogetherRows,
} from './sources'

/**
 * The three strips under a product, composed. Reads in parallel, never
 * throws, and returns three lists that share no card (`dedupeStrips`).
 *
 * The seed is what the page already has: the product id and its integer
 * price. `kenyon_price_agorot` is on every active row (46 of 46 on
 * 2026-10-08); a product without one gets no similar-price strip rather than
 * a strip ranked on a shekel float.
 */
export type ProductStrips = {
  boughtTogether: RecommendedProduct[]
  viewedTogether: RecommendedProduct[]
  similarPrice: RecommendedProduct[]
}

export const EMPTY_STRIPS: ProductStrips = {
  boughtTogether: [],
  viewedTogether: [],
  similarPrice: [],
}

export async function loadProductStrips(seed: {
  id: string
  priceAgorot: number | null
}): Promise<ProductStrips> {
  try {
    const band = seed.priceAgorot === null ? null : priceBand(seed.priceAgorot)
    const [boughtRows, viewedRows, bandCandidates] = await Promise.all([
      loadBoughtTogetherRows(),
      loadViewedTogetherRows(),
      band ? loadPriceBandCandidates(band, seed.id) : Promise.resolve([]),
    ])

    const exclude = new Set([seed.id])
    const bought = neighboursOf(buildCooccurrence(basketsFromRows(boughtRows)), seed.id, {
      limit: STRIP_SIZE * 2,
      exclude,
    })
    const viewed = neighboursOf(buildCooccurrence(basketsFromRows(viewedRows)), seed.id, {
      limit: STRIP_SIZE * 2,
      exclude,
    })

    const wanted = [...new Set([...bought, ...viewed].map((n) => n.productId))]
    const cards = wanted.length > 0 ? await loadProductsByIds(wanted) : []
    const byId = new Map(cards.map((c) => [c.id, c]))
    const pick = (ids: readonly string[]) =>
      ids.map((id) => byId.get(id)).filter((c): c is RecommendedProduct => c !== undefined)

    return dedupeStrips({
      boughtTogether: pick(bought.map((n) => n.productId)),
      viewedTogether: pick(viewed.map((n) => n.productId)),
      similarPrice:
        seed.priceAgorot === null
          ? []
          : rankBySimilarPrice(bandCandidates, seed.priceAgorot, { exclude }),
    })
  } catch (error) {
    log.warn('recommendations.product_strips_threw', {
      reason: error instanceof Error ? error.message : 'unknown',
    })
    return EMPTY_STRIPS
  }
}
