import { z } from 'zod'

/**
 * What each home page section kind is configured with, and the parser that
 * refuses everything else.
 *
 * `homepage_sections.config` is `jsonb`. 206 adds a CHECK that it is an OBJECT
 * and stops there, deliberately: a CHECK encoding four different per-kind
 * shapes is a CHECK nobody will extend correctly, and the fifth kind would be
 * added without it. The shape lives here, in one file, next to the type the
 * renderer reads.
 *
 * PARSING IS TOTAL AND NEVER THROWS. A section whose config does not parse
 * yields `null` and the renderer skips it. The home page is the page every
 * visitor lands on; a config typo must cost one section, never the page. That
 * is the same rule `readHomepageContent` already follows for a failed query,
 * and it is why the admin console shows what a section will actually render
 * before it is published rather than relying on the save to have refused.
 *
 * DEFAULTS ARE APPLIED HERE AND NOT IN THE COMPONENT. `limit` missing means
 * four, in one place, so the admin's preview count and the page's row length
 * cannot disagree.
 */

/** Every kind the CHECK in 206 permits. */
export const SECTION_KINDS = [
  'hero',
  'categories',
  'benefits',
  'deals',
  'featured',
  'city_deals',
  'banner_row',
  'product_rail',
  'category_spotlight',
  'supplier_spotlight',
  'countdown',
] as const

export type SectionKind = (typeof SECTION_KINDS)[number]

/**
 * How a product rail decides which products it holds.
 *
 * `ending_soon` READS `offer_valid_until`, AND MEASURED AGAINST PRODUCTION ON
 * 2026-09-09 THAT COLUMN IS NULL ON ALL 44 ACTIVE PRODUCTS. So this rule
 * matches nothing today. It is built anyway because the column is the right
 * signal and the operator is the one who fills it - but the admin console
 * prints the live match count next to the rule for exactly this reason, and a
 * rail that resolves to nothing does not render at all rather than painting an
 * empty box under a heading.
 *
 * `manual` is a list of product ids in the config and NOT the `is_featured`
 * column. Measured the same day: `is_featured` is false on all 44, so it is a
 * flag nothing sets and nothing reads, and a rail built on it would be a rail
 * that is empty until somebody finds a checkbox. A rail that names its products
 * also lets two rails hold different ones, which one boolean column cannot.
 */
export const RAIL_SOURCES = ['manual', 'biggest_discount', 'newest', 'ending_soon'] as const
export type RailSource = (typeof RAIL_SOURCES)[number]

/** Four to twelve. Below four is not a rail; above twelve is a category page. */
const limit = z.coerce.number().int().min(1).max(12).default(4)

const productRailConfig = z.object({
  source: z.enum(RAIL_SOURCES).default('newest'),
  /**
   * Only read when `source` is `manual`. Kept as ids in `config` rather than in
   * a join table: a rail holds four to twelve products, the list is ordered by
   * the operator, and a table would need its own position column, its own RLS
   * and its own cascade for a list that is edited by dragging four cards. The
   * cost is that an id can dangle when a product is deleted, and the read drops
   * a product it cannot find rather than rendering a hole.
   */
  productIds: z.array(z.string().uuid()).max(12).default([]),
  limit,
})

const categorySpotlightConfig = z.object({
  categorySlug: z.string().min(1).max(200),
  limit,
})

const supplierSpotlightConfig = z.object({
  supplierId: z.string().uuid(),
  limit,
})

const countdownConfig = z.object({
  /**
   * The instant the counter runs to, as an ISO string.
   *
   * IT IS NOT `ends_at`. The section's own window decides whether the banner is
   * ON THE PAGE; this decides what the digits count to. Reusing `ends_at` would
   * mean a banner that vanishes at the moment it becomes interesting - the
   * counter would hit zero and the row would leave the live view in the same
   * second - and there would be no way to say "the sale ends at midnight, keep
   * showing the banner until 2am".
   */
  deadline: z.string().datetime({ offset: true }),
  /** Where the banner sends a visitor. Internal only; see 127's CHECK. */
  linkUrl: z
    .string()
    .regex(/^\/(?!\/)/, 'הקישור חייב להיות פנימי ולהתחיל בלוכסן')
    .max(500)
    .optional(),
  ctaLabelHe: z.string().max(60).optional(),
})

export type ProductRailConfig = z.infer<typeof productRailConfig>
export type CategorySpotlightConfig = z.infer<typeof categorySpotlightConfig>
export type SupplierSpotlightConfig = z.infer<typeof supplierSpotlightConfig>
export type CountdownConfig = z.infer<typeof countdownConfig>

/**
 * A section's config, discriminated by kind.
 *
 * The seven kinds from 127 take no configuration at all and are typed as such,
 * so `parseSectionConfig('benefits', anything)` is `{}` rather than a shape
 * somebody might start reading keys off.
 */
export type SectionConfig =
  | { kind: 'product_rail'; config: ProductRailConfig }
  | { kind: 'category_spotlight'; config: CategorySpotlightConfig }
  | { kind: 'supplier_spotlight'; config: SupplierSpotlightConfig }
  | { kind: 'countdown'; config: CountdownConfig }
  | {
      kind: 'hero' | 'categories' | 'benefits' | 'deals' | 'featured' | 'city_deals' | 'banner_row'
      config: Record<string, never>
    }

/**
 * Read a stored config, or null if it cannot be trusted.
 *
 * Null is a skipped section, not an error page. See the file header.
 */
export function parseSectionConfig(kind: string, raw: unknown): SectionConfig | null {
  const value = typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? raw : {}

  switch (kind) {
    case 'product_rail': {
      const parsed = productRailConfig.safeParse(value)
      if (!parsed.success) return null
      // A manual rail with no products named is not a rail, it is an empty
      // heading. Refused here so the renderer never has to ask.
      if (parsed.data.source === 'manual' && parsed.data.productIds.length === 0) return null
      return { kind: 'product_rail', config: parsed.data }
    }
    case 'category_spotlight': {
      const parsed = categorySpotlightConfig.safeParse(value)
      return parsed.success ? { kind: 'category_spotlight', config: parsed.data } : null
    }
    case 'supplier_spotlight': {
      const parsed = supplierSpotlightConfig.safeParse(value)
      return parsed.success ? { kind: 'supplier_spotlight', config: parsed.data } : null
    }
    case 'countdown': {
      const parsed = countdownConfig.safeParse(value)
      return parsed.success ? { kind: 'countdown', config: parsed.data } : null
    }
    case 'hero':
    case 'categories':
    case 'benefits':
    case 'deals':
    case 'featured':
    case 'city_deals':
    case 'banner_row':
      return { kind, config: {} }
    default:
      // A kind the CHECK would have refused. Reachable only if the constraint
      // and this file disagree, which is worth skipping rather than rendering.
      return null
  }
}

/** The zod schemas, exported for the admin action to validate a form against. */
export const SECTION_CONFIG_SCHEMAS = {
  product_rail: productRailConfig,
  category_spotlight: categorySpotlightConfig,
  supplier_spotlight: supplierSpotlightConfig,
  countdown: countdownConfig,
} as const

/** Hebrew labels for the console. One place, so the list and the form agree. */
export const SECTION_KIND_LABELS: Record<SectionKind, string> = {
  hero: 'קרוסלת פתיחה',
  categories: 'רצועת קטגוריות',
  benefits: 'רצועת יתרונות',
  deals: 'רשת המוצרים',
  featured: 'מוצרים נבחרים (ללא רכיב)',
  city_deals: 'דילים לפי עיר (ללא רכיב)',
  banner_row: 'שורת באנרים (ללא רכיב)',
  product_rail: 'רצועת מוצרים',
  category_spotlight: 'קטגוריה בזרקור',
  supplier_spotlight: 'בית עסק בזרקור',
  countdown: 'באנר ספירה לאחור',
}

export const RAIL_SOURCE_LABELS: Record<RailSource, string> = {
  manual: 'בחירה ידנית',
  biggest_discount: 'ההנחה הגדולה ביותר',
  newest: 'החדשים ביותר',
  ending_soon: 'התוקף נגמר בקרוב',
}
