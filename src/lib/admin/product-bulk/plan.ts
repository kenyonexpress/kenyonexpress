import { catalogueIlsToAgorot, scaleCatalogueIls } from '@/lib/admin/bulk-price'
import { agorotToIls } from '@/lib/commerce/money'
import { deriveDiscountPercent } from '@/lib/commerce/product-money'
import { z } from 'zod'

/**
 * The bulk edit planner: given one product row and one operation, decide
 * what (if anything) changes. Pure, so the dry run and the apply step use
 * the SAME function and the preview cannot promise one thing while the
 * write does another - the failure the CSV import guards against with its
 * shared validator, guarded here the same way.
 *
 * Money stays integer. Prices go through `scaleCatalogueIls` /
 * `catalogueIlsToAgorot` (applyBp underneath) and never through a float
 * multiply; a coupon's discount badge is re-derived from its two prices
 * rather than left stale, because the badge on a coupon is a consequence of
 * the prices and not a field of its own (`deriveDiscountPercent`).
 *
 * Every outcome is one of three: `change` with the exact columns to write and
 * their prior values (the journal the whole-run rollback replays), `skip`
 * with a Hebrew reason the admin reads in the preview, or `unchanged`.
 */

export const REPLACE_FIELDS = [
  'name_he',
  'name_en',
  'short_description_he',
  'description_he',
  'brand',
  'seo_title',
  'seo_description',
] as const

export type ReplaceField = (typeof REPLACE_FIELDS)[number]

export const REPLACE_FIELD_LABEL: Record<ReplaceField, string> = {
  name_he: 'שם בעברית',
  name_en: 'שם באנגלית',
  short_description_he: 'תיאור קצר',
  description_he: 'תיאור',
  brand: 'מותג',
  seo_title: 'כותרת SEO',
  seo_description: 'תיאור SEO',
}

/** Per-field limits, mirrored from productSchema so a replace cannot write what the form refuses. */
const REPLACE_FIELD_LIMITS: Record<ReplaceField, { min: number; max: number | null }> = {
  name_he: { min: 2, max: 200 },
  name_en: { min: 0, max: 200 },
  short_description_he: { min: 0, max: 300 },
  description_he: { min: 0, max: null },
  brand: { min: 0, max: 120 },
  seo_title: { min: 0, max: 200 },
  seo_description: { min: 0, max: 400 },
}

const priceOperation = z.object({
  kind: z.literal('price'),
  mode: z.enum(['percent', 'set']),
  value: z.coerce.number().finite(),
})

const stockOperation = z.object({
  kind: z.literal('stock'),
  mode: z.enum(['set', 'delta']),
  value: z.coerce.number().int('המלאי חייב להיות מספר שלם'),
})

const discountOperation = z.object({
  kind: z.literal('discount'),
  /** null clears the discount. */
  value: z.preprocess(
    (v) => (v === '' || v === undefined ? null : v),
    z.coerce.number().min(0, 'אחוז הנחה בין 0 ל-100').max(100, 'אחוז הנחה בין 0 ל-100').nullable(),
  ),
})

const replaceOperation = z.object({
  kind: z.literal('replace'),
  field: z.enum(REPLACE_FIELDS),
  find: z.string().min(1, 'יש להזין טקסט לחיפוש').max(200, 'עד 200 תווים'),
  replace: z.string().max(2000, 'עד 2000 תווים'),
  caseInsensitive: z.boolean().default(false),
})

const imagesOperation = z.object({
  kind: z.literal('images'),
  /** replace: the matched images become the gallery; append: added after the current ones. */
  mode: z.enum(['replace', 'append']),
  /** Key prefix inside the product-images bucket to list, e.g. `catalog/2026/`. */
  prefix: z.preprocess(
    (v) => (typeof v === 'string' ? v.trim().replace(/^\/+/, '') : ''),
    z.string().max(200, 'עד 200 תווים'),
  ),
})

// zod v3's discriminatedUnion takes plain objects only, so the cross-field
// rules live in one refinement on the union rather than on each member.
export const bulkOperationSchema = z
  .discriminatedUnion('kind', [
    priceOperation,
    stockOperation,
    discountOperation,
    replaceOperation,
    imagesOperation,
  ])
  .superRefine((op, ctx) => {
    if (op.kind === 'price') {
      if (op.mode === 'percent' && (op.value < -90 || op.value > 500)) {
        ctx.addIssue({
          code: 'custom',
          path: ['value'],
          message: 'אחוז השינוי חייב להיות בין -90 ל-500',
        })
      }
      if (op.mode === 'set' && op.value < 0.01) {
        ctx.addIssue({ code: 'custom', path: ['value'], message: 'המחיר חייב להיות חיובי' })
      }
    }
    if (op.kind === 'stock') {
      if (op.mode === 'set' && op.value < 0) {
        ctx.addIssue({ code: 'custom', path: ['value'], message: 'מלאי לא יכול להיות שלילי' })
      }
      if (op.mode === 'delta' && op.value === 0) {
        ctx.addIssue({ code: 'custom', path: ['value'], message: 'שינוי של 0 לא משנה דבר' })
      }
    }
  })

export type BulkOperation = z.infer<typeof bulkOperationSchema>
export type BulkOperationKind = BulkOperation['kind']

/** The columns every bulk operation reads. One select string, one row shape. */
export const BULK_PRODUCT_COLUMNS =
  'id, slug, name_he, name_en, sku, type, status, kenyon_price, full_price, coupon_price_ils, discount_percent, stock_quantity, description_he, short_description_he, brand, seo_title, seo_description, images, updated_at'

export interface BulkProductRow {
  id: string
  slug: string
  name_he: string
  name_en: string | null
  sku: string | null
  type: string
  status: string
  kenyon_price: number | null
  full_price: number | null
  coupon_price_ils: number | null
  discount_percent: number | null
  stock_quantity: number | null
  description_he: string | null
  short_description_he: string | null
  brand: string | null
  seo_title: string | null
  seo_description: string | null
  images: unknown
  updated_at: string
}

export type PlanOutcome =
  | {
      status: 'change'
      /** Columns to write, exactly. */
      fields: Record<string, unknown>
      /** The same columns' current values, for the journal. */
      prior: Record<string, unknown>
    }
  | { status: 'skip'; reason: string }
  | { status: 'unchanged' }

export interface PlanContext {
  /** For `images`: public URLs per SKU, already matched and host-checked. */
  imagesBySku?: ReadonlyMap<string, readonly string[]>
}

function change(row: BulkProductRow, fields: Record<string, unknown>): PlanOutcome {
  const prior: Record<string, unknown> = {}
  for (const key of Object.keys(fields)) {
    prior[key] = (row as unknown as Record<string, unknown>)[key] ?? null
  }
  return { status: 'change', fields, prior }
}

function planPrice(
  row: BulkProductRow,
  op: Extract<BulkOperation, { kind: 'price' }>,
): PlanOutcome {
  if (row.type === 'recurring')
    return { status: 'skip', reason: 'מנוי מחויב לפי סכום תקופתי, לא לפי מחיר' }

  let nextKenyon: number | null
  let nextFull: number | null | undefined
  if (op.mode === 'percent') {
    if (row.kenyon_price == null || row.kenyon_price <= 0) {
      return { status: 'skip', reason: 'אין מחיר להתאים' }
    }
    nextKenyon = scaleCatalogueIls(row.kenyon_price, op.value)
    if (nextKenyon == null) return { status: 'skip', reason: 'מחיר לא תקין' }
    if (row.full_price != null) {
      nextFull = scaleCatalogueIls(row.full_price, op.value)
      if (nextFull == null) return { status: 'skip', reason: 'מחיר מלא לא תקין' }
    }
  } else {
    const agorot = catalogueIlsToAgorot(op.value)
    if (agorot == null) return { status: 'skip', reason: 'מחיר לא תקין' }
    nextKenyon = agorotToIls(agorot)
    const fullAgorot = row.full_price != null ? catalogueIlsToAgorot(row.full_price) : null
    if (fullAgorot != null && fullAgorot < agorot) {
      return { status: 'skip', reason: 'המחיר המלא נמוך מהמחיר החדש' }
    }
  }

  const fields: Record<string, unknown> = { kenyon_price: nextKenyon, price_ils: nextKenyon }
  if (nextFull !== undefined) fields.full_price = nextFull

  if (row.type === 'coupon') {
    // The coupon still charges coupon_price_ils; only the sticker moved. A
    // sticker below the charge is the quote-versus-charge split, refused.
    if (row.coupon_price_ils != null && row.coupon_price_ils > nextKenyon) {
      return { status: 'skip', reason: 'מחיר הקופון גבוה מהמחיר החדש' }
    }
    fields.discount_percent = deriveDiscountPercent(nextKenyon, row.coupon_price_ils)
  }

  const same =
    row.kenyon_price === nextKenyon &&
    (nextFull === undefined || row.full_price === nextFull) &&
    (row.type !== 'coupon' || row.discount_percent === fields.discount_percent)
  return same ? { status: 'unchanged' } : change(row, fields)
}

function planStock(
  row: BulkProductRow,
  op: Extract<BulkOperation, { kind: 'stock' }>,
): PlanOutcome {
  if (row.type === 'coupon' || row.type === 'recurring' || row.type === 'service') {
    return { status: 'skip', reason: 'למוצר הזה אין מלאי פיזי' }
  }
  const current = row.stock_quantity ?? 0
  const next = op.mode === 'set' ? op.value : Math.max(0, current + op.value)
  if (row.stock_quantity !== null && next === current) return { status: 'unchanged' }
  return change(row, { stock_quantity: next })
}

function planDiscount(
  row: BulkProductRow,
  op: Extract<BulkOperation, { kind: 'discount' }>,
): PlanOutcome {
  if (row.type === 'coupon') return { status: 'skip', reason: 'הנחה בקופון נגזרת משני המחירים' }
  if (row.type === 'recurring') return { status: 'skip', reason: 'למנוי אין אחוז הנחה' }
  if ((row.discount_percent ?? null) === op.value) return { status: 'unchanged' }
  return change(row, { discount_percent: op.value })
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Literal replace-all. `$` in the replacement is literal too (no `$1` expansion). */
export function replaceAllLiteral(
  haystack: string,
  find: string,
  replacement: string,
  caseInsensitive: boolean,
): string {
  if (find === '') return haystack
  const re = new RegExp(escapeRegExp(find), caseInsensitive ? 'gi' : 'g')
  return haystack.replace(re, () => replacement)
}

function planReplace(
  row: BulkProductRow,
  op: Extract<BulkOperation, { kind: 'replace' }>,
): PlanOutcome {
  const current = row[op.field]
  if (typeof current !== 'string' || current === '') return { status: 'unchanged' }
  const next = replaceAllLiteral(current, op.find, op.replace, op.caseInsensitive)
  if (next === current) return { status: 'unchanged' }
  const limits = REPLACE_FIELD_LIMITS[op.field]
  const trimmed = next.trim()
  if (trimmed.length < limits.min) {
    return {
      status: 'skip',
      reason:
        limits.min > 0
          ? `${REPLACE_FIELD_LABEL[op.field]}: התוצאה קצרה מ-${limits.min} תווים`
          : `${REPLACE_FIELD_LABEL[op.field]}: התוצאה ריקה`,
    }
  }
  if (limits.max !== null && trimmed.length > limits.max) {
    return {
      status: 'skip',
      reason: `${REPLACE_FIELD_LABEL[op.field]}: התוצאה ארוכה מ-${limits.max} תווים`,
    }
  }
  // Optional text columns empty out to null, like the form does.
  const value = trimmed === '' ? null : next
  return change(row, { [op.field]: value })
}

/** The string entries of a `products.images` jsonb, in order. */
export function currentImageUrls(images: unknown): string[] {
  return Array.isArray(images) ? images.filter((u): u is string => typeof u === 'string') : []
}

function planImages(
  row: BulkProductRow,
  op: Extract<BulkOperation, { kind: 'images' }>,
  ctx: PlanContext,
): PlanOutcome {
  const sku = (row.sku ?? '').trim()
  if (sku === '') return { status: 'skip', reason: 'אין מק"ט, אין לפי מה להתאים תמונה' }
  const matched = ctx.imagesBySku?.get(sku.toLowerCase()) ?? []
  if (matched.length === 0) return { status: 'skip', reason: 'לא נמצאו תמונות למק"ט הזה' }
  const current = currentImageUrls(row.images)
  const next =
    op.mode === 'replace'
      ? [...matched]
      : [...current, ...matched.filter((url) => !current.includes(url))]
  const same = next.length === current.length && next.every((url, i) => url === current[i])
  return same ? { status: 'unchanged' } : change(row, { images: next })
}

export function planProductChange(
  row: BulkProductRow,
  op: BulkOperation,
  ctx: PlanContext = {},
): PlanOutcome {
  switch (op.kind) {
    case 'price':
      return planPrice(row, op)
    case 'stock':
      return planStock(row, op)
    case 'discount':
      return planDiscount(row, op)
    case 'replace':
      return planReplace(row, op)
    case 'images':
      return planImages(row, op, ctx)
    default:
      return { status: 'skip', reason: 'פעולה לא מוכרת' }
  }
}

/** True for operations that change money and therefore need the money tier. */
export function isMoneyOperation(op: BulkOperation): boolean {
  return op.kind === 'price' || op.kind === 'discount'
}

/** One Hebrew line naming the operation, for the history row and the confirm. */
export function describeOperation(op: BulkOperation): string {
  switch (op.kind) {
    case 'price':
      return op.mode === 'percent'
        ? `מחירים ${op.value > 0 ? '+' : ''}${op.value}%`
        : `מחיר ${op.value} ₪`
    case 'stock':
      return op.mode === 'set' ? `מלאי = ${op.value}` : `מלאי ${op.value > 0 ? '+' : ''}${op.value}`
    case 'discount':
      return op.value === null ? 'ביטול הנחה' : `הנחה ${op.value}%`
    case 'replace':
      return `החלפת "${op.find}" ב-"${op.replace}" ב${REPLACE_FIELD_LABEL[op.field]}`
    case 'images':
      return `תמונות מ-R2${op.prefix ? ` (${op.prefix})` : ''} · ${op.mode === 'replace' ? 'החלפה' : 'הוספה'}`
    default:
      return 'עריכה קבוצתית'
  }
}
