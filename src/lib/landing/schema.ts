import {
  LANDING_BLOCK_KINDS,
  LANDING_PAGE_STATUSES,
  type LandingBlock,
  type LandingPageStatus,
  type LandingVariant,
} from '@/lib/landing/blocks'
import { LANDING_SLUG_MAX_LENGTH, LANDING_SLUG_PATTERN } from '@/lib/landing/slug'
import { z } from 'zod'

/**
 * Validation for landing page content, applied on every write AND every read.
 *
 * On write (the admin form) so an editor sees a field error in Hebrew rather
 * than a broken page. On read (`read.ts`) because a row can be edited by
 * hand, by a future import, or by a form from before a block gained a field;
 * a page that fails here is a 404, never a half-rendered one.
 *
 * Server side only. Client components get the types from `blocks.ts`; this
 * module carries zod, which is the one dependency the storefront first load
 * must not pay for twice (STEP 34).
 *
 * LINKS ARE SITE-RELATIVE. The same rule 127 wrote as a CHECK on banners: a
 * link that leaves the site from the site's own campaign page is an open
 * redirect surface wearing a marketing hat. Images may be a site path or an
 * https URL, because the catalogue photographs live on R2.
 */

const SHORT = 200
const LONG = 2_000

const internalHref = z
  .string()
  .min(1, 'נדרש קישור')
  .max(500, 'קישור ארוך מדי')
  .regex(/^\/(?!\/)/, 'קישור חייב להיות פנימי ולהתחיל ב-/')

const imageUrl = z
  .string()
  .max(1_000, 'כתובת תמונה ארוכה מדי')
  .regex(/^(\/(?!\/)|https:\/\/)/, 'תמונה חייבת להיות נתיב באתר או כתובת https')

const shortText = (what: string) => z.string().min(1, `נדרש ${what}`).max(SHORT, `${what} ארוך מדי`)
const longText = (what: string) => z.string().min(1, `נדרש ${what}`).max(LONG, `${what} ארוך מדי`)

const ctaSchema = z.object({ label: shortText('טקסט כפתור'), href: internalHref })

export const landingBlockSchema: z.ZodType<LandingBlock> = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('hero'),
    headline: shortText('כותרת'),
    subheadline: shortText('כותרת משנה').optional(),
    imageUrl: imageUrl.optional(),
    imageAlt: shortText('תיאור תמונה').optional(),
    cta: ctaSchema.optional(),
  }),
  z.object({
    kind: z.literal('text'),
    title: shortText('כותרת').optional(),
    paragraphs: z.array(longText('פסקה')).min(1, 'נדרשת לפחות פסקה אחת').max(20),
  }),
  z.object({
    kind: z.literal('benefits'),
    title: shortText('כותרת').optional(),
    items: z
      .array(z.object({ title: shortText('כותרת יתרון'), text: longText('טקסט').optional() }))
      .min(1, 'נדרש לפחות יתרון אחד')
      .max(12),
  }),
  z.object({
    kind: z.literal('products'),
    title: shortText('כותרת').optional(),
    slugs: z
      .array(z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/i, 'מזהה מוצר לא תקין'))
      .max(24, 'עד 24 מוצרים בבלוק'),
    limit: z.number().int().min(1).max(24).optional(),
  }),
  z.object({
    kind: z.literal('faq'),
    title: shortText('כותרת').optional(),
    items: z
      .array(z.object({ question: shortText('שאלה'), answer: longText('תשובה') }))
      .min(1, 'נדרשת לפחות שאלה אחת')
      .max(20),
  }),
  z.object({
    kind: z.literal('countdown'),
    label: shortText('טקסט'),
    endsAt: z.string().refine((value) => !Number.isNaN(Date.parse(value)), 'תאריך סיום לא תקין'),
  }),
  z.object({
    kind: z.literal('cta'),
    label: shortText('טקסט כפתור'),
    href: internalHref,
    note: shortText('הערה').optional(),
  }),
])

export const MAX_BLOCKS = 30
export const MAX_VARIANTS = 6

export const landingBlocksSchema = z
  .array(landingBlockSchema)
  .max(MAX_BLOCKS, `עד ${MAX_BLOCKS} בלוקים בעמוד`)

export const VARIANT_KEY_PATTERN = /^[a-z0-9_]{1,24}$/

export const landingVariantsSchema: z.ZodType<LandingVariant[]> = z
  .array(
    z.object({
      key: z
        .string()
        .regex(VARIANT_KEY_PATTERN, 'מפתח גרסה: אותיות לועזיות קטנות, ספרות וקו תחתון'),
      weight: z.number().int('משקל חייב להיות מספר שלם').min(0).max(100),
      blocks: landingBlocksSchema.optional(),
    }),
  )
  .max(MAX_VARIANTS, `עד ${MAX_VARIANTS} גרסאות`)
  .superRefine((variants, ctx) => {
    const keys = variants.map((variant) => variant.key)
    if (new Set(keys).size !== keys.length) {
      ctx.addIssue({ code: 'custom', message: 'מפתחות הגרסאות חייבים להיות ייחודיים' })
    }
    if (variants.length > 0 && variants.every((variant) => variant.weight === 0)) {
      ctx.addIssue({ code: 'custom', message: 'לפחות גרסה אחת צריכה משקל גדול מאפס' })
    }
  })

export const landingSlugSchema = z
  .string()
  .max(LANDING_SLUG_MAX_LENGTH, `עד ${LANDING_SLUG_MAX_LENGTH} תווים`)
  .regex(LANDING_SLUG_PATTERN, 'אותיות לועזיות קטנות, ספרות ומקפים בלבד')

export const landingStatusSchema = z.enum(
  LANDING_PAGE_STATUSES as [LandingPageStatus, ...LandingPageStatus[]],
)

export type ParseOutcome<T> = { ok: true; value: T } | { ok: false; errors: string[] }

/** One Hebrew line per issue, with the JSON path so an editor can find it in a long array. */
function issuesToLines(error: z.ZodError): string[] {
  return error.issues.map((issue) =>
    issue.path.length ? `${issue.path.join('.')}: ${issue.message}` : issue.message,
  )
}

export function parseLandingBlocks(value: unknown): ParseOutcome<LandingBlock[]> {
  const parsed = landingBlocksSchema.safeParse(value)
  return parsed.success
    ? { ok: true, value: parsed.data }
    : { ok: false, errors: issuesToLines(parsed.error) }
}

export function parseLandingVariants(value: unknown): ParseOutcome<LandingVariant[]> {
  const parsed = landingVariantsSchema.safeParse(value)
  return parsed.success
    ? { ok: true, value: parsed.data }
    : { ok: false, errors: issuesToLines(parsed.error) }
}

/** JSON text from a form textarea: a parse failure is one error line, never a throw. */
export function parseJsonText(text: string): ParseOutcome<unknown> {
  const trimmed = text.trim()
  if (trimmed === '') return { ok: true, value: [] }
  try {
    return { ok: true, value: JSON.parse(trimmed) }
  } catch {
    return { ok: false, errors: ['JSON לא תקין'] }
  }
}

export function isKnownBlockKind(value: unknown): value is LandingBlock['kind'] {
  return (LANDING_BLOCK_KINDS as readonly unknown[]).includes(value)
}
