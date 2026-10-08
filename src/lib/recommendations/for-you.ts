import 'server-only'

import { log } from '@/lib/observability/log'
import { loadRelatedProducts } from '@/lib/related-products'
import {
  FOR_YOU_SIZE,
  basketsFromRows,
  buildCooccurrence,
  neighboursOfMany,
  sanitizeSeedIds,
  stripOrNothing,
} from './rules'
import {
  type RecommendedProduct,
  loadBoughtTogetherRows,
  loadProductsByIds,
  loadViewedTogetherRows,
  loadVisitorHistory,
} from './sources'

/**
 * The personalised home row, from one visitor's `view_item` history.
 *
 * WHERE THE HISTORY COMES FROM, in order:
 *
 * 1. PostHog, by the visitor's distinct id (`loadVisitorHistory`), when the
 *    private API is configured. This is the source the goal names.
 * 2. The seeds the browser sent: the same product ids, recorded in
 *    localStorage at the moment `view_item` was captured
 *    (`recent-views.ts`, consent-gated like the capture). This is what keeps
 *    the row alive on a deployment with no `POSTHOG_API_KEY`, and what fills
 *    the gap between a view and PostHog's ingestion lag.
 *
 * Both lists are UUID-filtered and capped before they touch a query, because
 * both are visitor-controlled.
 *
 * WHAT IS RECOMMENDED. Products that shared a basket with what the visitor
 * looked at, summed across their history (`neighboursOfMany`, viewed and
 * bought baskets together), then, when that is thin (it is: see the counts in
 * `rules.ts`), siblings from the categories they browsed. The visitor's own
 * viewed products are never in the row: "you looked at this" is not a
 * recommendation. Under the strip floor the row is empty and the component
 * renders nothing, so a visitor with no history sees the page they saw
 * yesterday.
 */
export async function loadForYou(input: {
  distinctId: string | null
  seedIds: readonly unknown[]
}): Promise<RecommendedProduct[]> {
  try {
    const fromBrowser = sanitizeSeedIds(input.seedIds)
    const fromPostHog = input.distinctId ? await loadVisitorHistory(input.distinctId) : []
    // PostHog first (the fuller record), browser seeds filling in; the cap keeps
    // the `IN (...)` below bounded whatever a client sends.
    const history = sanitizeSeedIds([...fromPostHog, ...fromBrowser])
    if (history.length === 0) return []

    const [viewedRows, boughtRows, seedCards] = await Promise.all([
      loadViewedTogetherRows(),
      loadBoughtTogetherRows(),
      loadProductsByIds(history),
    ])
    const matrix = buildCooccurrence(basketsFromRows([...viewedRows, ...boughtRows]))
    const exclude = new Set(history)
    const ranked = neighboursOfMany(matrix, history, { limit: FOR_YOU_SIZE, exclude })

    const picks: RecommendedProduct[] = []
    const taken = new Set<string>(history)
    const add = (p: RecommendedProduct) => {
      if (taken.has(p.id) || picks.length >= FOR_YOU_SIZE) return
      taken.add(p.id)
      picks.push(p)
    }

    if (ranked.length > 0) {
      for (const card of await loadProductsByIds(ranked.map((n) => n.productId))) add(card)
    }

    // Category fill: the categories the visitor browsed, most recent first,
    // each contributing its newest siblings until the row is full.
    if (picks.length < FOR_YOU_SIZE) {
      const seen = new Set<string>()
      for (const seed of seedCards) {
        if (picks.length >= FOR_YOU_SIZE) break
        const categoryId = seed.categoryId
        if (!categoryId || seen.has(categoryId)) continue
        seen.add(categoryId)
        for (const sibling of await loadRelatedProducts(categoryId, seed.id)) {
          add({ ...sibling, priceAgorot: null, categoryId })
        }
      }
    }

    return stripOrNothing(picks)
  } catch (error) {
    log.warn('recommendations.for_you_threw', {
      reason: error instanceof Error ? error.message : 'unknown',
    })
    return []
  }
}
