/**
 * Matching uploaded image filenames to products.
 *
 * =========================================================================
 * THE SECTION SAYS "FILENAME-TO-SKU MATCHING". ONE PRODUCT HAS A SKU.
 * =========================================================================
 *
 * Measured against production 2026-09-10: 80 products, **1** with a non-empty
 * `sku`, and 43 of the 44 ACTIVE ones have none. A matcher keyed on SKU alone
 * would ship as a feature that can match exactly one row in the live
 * catalogue, which is indistinguishable from a broken one at every screen an
 * operator looks at.
 *
 * So SKU is tried first, exactly as asked, and `slug` is the fallback key.
 * Every product has one, it is unique among active products (a rule the
 * catalogue gate already enforces), and it is the string an operator can
 * actually name a file after because it is in the URL they are looking at.
 *
 * =========================================================================
 * AMBIGUITY IS AN OUTCOME, NOT AN ERROR TO SWALLOW
 * =========================================================================
 *
 * Two products can share a slug once a draft and an active row disagree, and
 * two files in one batch can reduce to the same key (`shoe.jpg` and
 * `shoe.png`). Both cases return `ambiguous` rather than picking a winner:
 * attaching an image to the wrong product is silent, survives review, and is
 * discovered by a customer.
 */

export interface MatchableProduct {
  id: string
  slug: string
  sku: string | null
  nameHe: string | null
}

export type ImageMatch = {
  filename: string
  productId: string
  /** Which key matched, so the preview can say why. */
  matchedOn: 'sku' | 'slug'
  productNameHe: string | null
}

export type ImageMatchProblem = {
  filename: string
  reason: 'no_match' | 'ambiguous_products' | 'ambiguous_files'
  /** For `ambiguous_products`, the ids that all answer to the same key. */
  productIds?: string[]
}

export interface ImageMatchResult {
  matched: ImageMatch[]
  problems: ImageMatchProblem[]
}

/**
 * The key a filename claims: its basename, lowercased, without the extension.
 *
 * `IMG_2024 Shoe.JPG` -> `img_2024 shoe`. Nothing else is stripped: guessing
 * that a trailing `-1` means "second image of the same product" would attach
 * files to products nobody asked for.
 */
export function imageKey(filename: string): string {
  const base = filename.split(/[\\/]/).pop() ?? filename
  const withoutExt = base.replace(/\.[a-z0-9]+$/i, '')
  return withoutExt.trim().toLowerCase()
}

function normalise(value: string | null | undefined): string | null {
  const trimmed = value?.trim().toLowerCase()
  return trimmed ? trimmed : null
}

export function matchImagesToProducts(
  filenames: ReadonlyArray<string>,
  products: ReadonlyArray<MatchableProduct>,
): ImageMatchResult {
  const bySku = new Map<string, MatchableProduct[]>()
  const bySlug = new Map<string, MatchableProduct[]>()
  for (const product of products) {
    const sku = normalise(product.sku)
    if (sku) bySku.set(sku, [...(bySku.get(sku) ?? []), product])
    const slug = normalise(product.slug)
    if (slug) bySlug.set(slug, [...(bySlug.get(slug) ?? []), product])
  }

  // Two files reducing to one key is decided BEFORE any lookup, so the answer
  // does not depend on which of them happened to be listed first.
  const keyCounts = new Map<string, number>()
  for (const filename of filenames) {
    const key = imageKey(filename)
    keyCounts.set(key, (keyCounts.get(key) ?? 0) + 1)
  }

  const matched: ImageMatch[] = []
  const problems: ImageMatchProblem[] = []

  for (const filename of filenames) {
    const key = imageKey(filename)
    if (!key) {
      problems.push({ filename, reason: 'no_match' })
      continue
    }
    if ((keyCounts.get(key) ?? 0) > 1) {
      problems.push({ filename, reason: 'ambiguous_files' })
      continue
    }

    // SKU first, as the section asks. Slug is the fallback the data requires.
    const candidates = bySku.get(key) ?? bySlug.get(key) ?? []
    const matchedOn: 'sku' | 'slug' = bySku.has(key) ? 'sku' : 'slug'

    if (candidates.length === 0) {
      problems.push({ filename, reason: 'no_match' })
      continue
    }
    if (candidates.length > 1) {
      problems.push({
        filename,
        reason: 'ambiguous_products',
        productIds: candidates.map((p) => p.id),
      })
      continue
    }

    const product = candidates[0] as MatchableProduct
    matched.push({
      filename,
      productId: product.id,
      matchedOn,
      productNameHe: product.nameHe,
    })
  }

  return { matched, problems }
}

export const MATCH_PROBLEM_LABELS: Record<ImageMatchProblem['reason'], string> = {
  no_match: 'לא נמצא מוצר עם מק"ט או slug בשם הזה',
  ambiguous_products: 'יותר ממוצר אחד עונה לשם הזה',
  ambiguous_files: 'יותר מקובץ אחד מצטמצם לאותו שם',
}
