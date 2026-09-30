import { z } from 'zod'

/**
 * Which products a bulk edit touches (`/admin/products/bulk`).
 *
 * A scope is a set of AND-ed filters the server turns into one PostgREST
 * query: a SKU glob, a name substring, a category, a status and a type. It
 * is deliberately not a free SQL fragment and not a list of ids typed by
 * hand - the admin describes the products in the vocabulary of the catalogue
 * and the dry run shows exactly which rows matched before anything is
 * written. `ids` exists for the apply step, which re-reads the rows the dry
 * run listed so a product that stopped matching in between (edited by
 * someone else, archived) is re-planned against its CURRENT values rather
 * than the values the preview saw.
 */

export const PRODUCT_STATUSES = ['draft', 'active', 'paused', 'sold_out', 'archived'] as const
export const PRODUCT_TYPES = ['physical', 'coupon', 'recurring', 'service'] as const

const optionalText = (max: number) =>
  z.preprocess(
    (v) => (typeof v === 'string' ? v.trim() : ''),
    z.string().max(max, `עד ${max} תווים`),
  )

export const bulkScopeSchema = z.object({
  /** Glob over `sku`: `*` any run, `?` one char. Case-insensitive. Empty = any. */
  skuPattern: optionalText(120).default(''),
  /** Substring of `name_he`. Empty = any. */
  q: optionalText(120).default(''),
  categoryId: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null),
    z.string().uuid('קטגוריה לא תקינה').nullable(),
  ),
  status: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null),
    z.enum(PRODUCT_STATUSES).nullable(),
  ),
  type: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null),
    z.enum(PRODUCT_TYPES).nullable(),
  ),
})

export type BulkScope = z.infer<typeof bulkScopeSchema>

export const EMPTY_SCOPE: BulkScope = {
  skuPattern: '',
  q: '',
  categoryId: null,
  status: null,
  type: null,
}

/**
 * Glob -> LIKE pattern, with the LIKE metacharacters in the admin's text
 * escaped first so a SKU that really contains `_` or `%` matches itself.
 * `*` and `?` are the only wildcards; nothing else is interpreted. A pattern
 * with no wildcard is therefore an exact (case-insensitive) match, which is
 * what someone typing one SKU expects.
 */
export function skuGlobToLike(pattern: string): string {
  return pattern
    .trim()
    .replace(/[\\%_]/g, (ch) => `\\${ch}`)
    .replace(/\*/g, '%')
    .replace(/\?/g, '_')
}

/** True when the scope would match the whole catalogue. */
export function isUnboundedScope(scope: BulkScope): boolean {
  return (
    scope.skuPattern === '' &&
    scope.q === '' &&
    scope.categoryId === null &&
    scope.status === null &&
    scope.type === null
  )
}

const STATUS_LABEL: Record<(typeof PRODUCT_STATUSES)[number], string> = {
  draft: 'טיוטה',
  active: 'פעיל',
  paused: 'מושהה',
  sold_out: 'אזל',
  archived: 'ארכיון',
}

const TYPE_LABEL: Record<(typeof PRODUCT_TYPES)[number], string> = {
  physical: 'מוצר פיזי',
  coupon: 'קופון',
  recurring: 'מנוי',
  service: 'שירות',
}

/** One Hebrew line naming the scope, for the run's history row. */
export function describeScope(scope: BulkScope, categoryName?: string | null): string {
  const parts: string[] = []
  if (scope.skuPattern) parts.push(`מק"ט ${scope.skuPattern}`)
  if (scope.q) parts.push(`שם מכיל "${scope.q}"`)
  if (scope.categoryId) parts.push(`קטגוריה ${categoryName ?? scope.categoryId.slice(0, 8)}`)
  if (scope.status) parts.push(STATUS_LABEL[scope.status])
  if (scope.type) parts.push(TYPE_LABEL[scope.type])
  return parts.length > 0 ? parts.join(' · ') : 'כל המוצרים'
}
