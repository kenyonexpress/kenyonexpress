import { z } from 'zod'

/**
 * The shape a supplier's own feed (JSON or CSV) must supply, and nothing
 * more. `platform_percent`, `category_id` and the product `type` are
 * deliberately ABSENT: they are business decisions this pipeline never lets
 * a supplier make for themselves. See migrations/pending/237_deals_autopilot.sql
 * and docs/DEALS-PIPELINE.md.
 *
 * Every numeric field arrives as a string or number and is validated here
 * as plain ILS; the agorot conversion happens in ingest.ts through
 * src/lib/commerce/money.ts's catalogueIlsToAgorot, never inline and never
 * as a float carried between the two.
 */
export const feedEntrySchema = z
  .object({
    external_ref: z
      .union([z.string(), z.number()])
      .transform((v) => String(v).trim())
      .pipe(z.string().min(1).max(200))
      .optional(),
    name: z.string().trim().min(1, 'name is required').max(300),
    price: z.union([z.string(), z.number()]),
    full_price: z.union([z.string(), z.number()]).optional(),
    discount_percent: z.union([z.string(), z.number()]).optional(),
    link: z
      .string()
      .trim()
      .min(1, 'link is required')
      .refine((v) => v.startsWith('https://'), 'link must be https'),
    category: z.string().trim().max(200).optional(),
    image: z
      .string()
      .trim()
      .optional()
      .refine((v) => !v || v.startsWith('https://'), 'image must be https'),
  })
  .strict()

export type FeedEntry = z.infer<typeof feedEntrySchema>

/** One feed entry, after every check, ready for the deal_candidates insert. */
export type ParsedCandidate = {
  externalRef: string
  nameHe: string
  priceAgorot: number
  fullPriceAgorot: number | null
  discountPercent: number | null
  linkUrl: string
  imageUrl: string | null
  categoryText: string | null
  rawPayload: Record<string, unknown>
}

/** One row (feed or CSV) that failed validation, kept for the fetch report. */
export type RejectedRow = {
  index: number
  reason: string
}

export type ParseResult = {
  candidates: ParsedCandidate[]
  rejected: RejectedRow[]
}
