import 'server-only'

import { type BundleDefinition, isBundleOpen } from '@/lib/bundles/evaluate'
import {
  BUNDLE_SELECT,
  bundleFromRow,
  isMissingBundleTable,
  noteBundleTableAbsent,
} from '@/lib/bundles/load'
import { CacheLife, CacheTags } from '@/lib/cache/tags'
import { CATALOGUE_TAG } from '@/lib/catalogue-cache'
import { firstImageOf } from '@/lib/images/blur'
import { log } from '@/lib/observability/log'
import { createCatalogueReadClient } from '@/lib/supabase/read-replica'
import { cacheLife, cacheTag } from 'next/cache'

/**
 * The product page's "buy together and save" block (STEP 60): every open
 * bundle this product belongs to, with its members named, priced and linked,
 * so a shopper can add the whole set in one tap.
 *
 * `'use cache'` under the product lifetime and the catalogue tag, like every
 * other reader on the page: an admin save calls `updateTag(CATALOGUE_TAG)`
 * and the block refreshes with the page. The cart itself reads bundles live
 * (`load.ts`), so the saving the cart shows is never behind this block.
 *
 * NEVER THROWS. The block is an upsell on a page whose reason to exist is
 * the buy button; a failed read (or an absent table before 265) is logged
 * and rendered as "no bundles", the way the price history chart is.
 *
 * THE WINDOW IS JUDGED INSIDE THE CACHE SCOPE, so the page stays static. An
 * offer that expires mid-lifetime is at most `CacheLife.product.revalidate`
 * seconds late to vanish here, and the cart stops honouring it on the second
 * it ends, so no shopper is promised a saving the charge will not give.
 */

export type BundleOfferMember = {
  product_id: string
  quantity: number
  name_he: string
  slug: string
  image_url: string | null
  /** Shekels, as the catalogue column stores it; display only. */
  price_ils: number
}

export type BundleOffer = {
  id: string
  name_he: string
  description_he: string | null
  /** Integer agorot off the on-site charge for one complete set. */
  discount_agorot: number
  members: BundleOfferMember[]
  /** The members' current prices added up, in agorot. Display only. */
  worth_agorot: number
}

type MemberProductRow = {
  id: string
  name_he: string
  slug: string
  images: unknown
  kenyon_price: number | string | null
  status: string
  deleted_at: string | null
}

export async function loadBundleOffersForProduct(productId: string): Promise<BundleOffer[]> {
  'use cache'
  cacheLife(CacheLife.product)
  cacheTag(CATALOGUE_TAG, CacheTags.product(productId))

  const supabase = createCatalogueReadClient()
  const { data: memberships, error: memberError } = await supabase
    .from('product_bundle_items')
    .select('bundle_id')
    .eq('product_id', productId)
  if (memberError) {
    if (isMissingBundleTable(memberError)) noteBundleTableAbsent('offers')
    else log.warn('bundles.offers_read_failed', { productId, reason: memberError.message })
    return []
  }
  const bundleIds = [
    ...new Set(((memberships as { bundle_id: string }[] | null) ?? []).map((m) => m.bundle_id)),
  ]
  if (bundleIds.length === 0) return []

  const { data, error } = await supabase
    .from('product_bundles')
    .select(BUNDLE_SELECT)
    .in('id', bundleIds)
    .eq('is_active', true)
  if (error) {
    log.warn('bundles.offers_read_failed', { productId, reason: error.message })
    return []
  }
  const now = new Date()
  const rows = (data as Parameters<typeof bundleFromRow>[0][] | null) ?? []
  const bundles = rows
    .map((row) => ({ definition: bundleFromRow(row), description: row.description_he ?? null }))
    .filter(({ definition }) => isBundleOpen(definition, now) && definition.items.length > 0)
  if (bundles.length === 0) return []

  const productIds = [
    ...new Set(bundles.flatMap((b) => b.definition.items.map((i) => i.product_id))),
  ]
  const { data: products, error: productError } = await supabase
    .from('products')
    .select('id, name_he, slug, images, kenyon_price, status, deleted_at')
    .in('id', productIds)
  if (productError) {
    log.warn('bundles.offers_products_failed', { productId, reason: productError.message })
    return []
  }
  const byId = new Map(
    ((products as MemberProductRow[] | null) ?? [])
      .filter((p) => p.status === 'active' && !p.deleted_at)
      .map((p) => [p.id, p]),
  )

  return bundles.flatMap(({ definition, description }) => toOffer(definition, description, byId))
}

/**
 * Exported for the tests. A bundle with a member that is not on sale is not
 * offered: the cart could never complete it, and a block promising a saving
 * on a set that cannot be bought is the "finished feature with no consumer"
 * shape this repo keeps finding.
 */
export function toOffer(
  definition: BundleDefinition,
  description: string | null,
  products: Map<string, MemberProductRow>,
): BundleOffer[] {
  const members: BundleOfferMember[] = []
  let worth = 0
  for (const item of definition.items) {
    const product = products.get(item.product_id)
    if (!product) return []
    const price = Number(product.kenyon_price ?? 0)
    if (!(price > 0)) return []
    members.push({
      product_id: product.id,
      quantity: item.quantity,
      name_he: product.name_he,
      slug: product.slug,
      image_url: firstImageOf(product.images),
      price_ils: price,
    })
    // One conversion per member, the same rounding the cart applies.
    worth += Math.round(price * 100) * item.quantity
  }
  if (members.length === 0) return []
  return [
    {
      id: definition.id,
      name_he: definition.name_he,
      description_he: description,
      discount_agorot: definition.discount_agorot,
      members,
      // The pricer caps the saving at the goods; the block says the same.
      worth_agorot: worth,
    },
  ]
}
