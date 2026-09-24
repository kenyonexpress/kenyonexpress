import type { Product } from '@/types/database'

/**
 * Phase 2 product fields, read off a row whose generated type predates them.
 *
 * `src/types/database.ts` is generated from production and has not been
 * regenerated since migration 112, so `Product` does not yet carry
 * `vat_exempt`, `tags`, `length_mm`, `width_mm` or `height_mm` even though the
 * columns exist. Reading defensively states that, the same way
 * `readRecurringProductFields` and `readWhatsAppEnabled` do. Delete these once
 * the types are regenerated.
 */
type Row = Product | Record<string, unknown> | null | undefined

function record(row: Row): Record<string, unknown> | null {
  return row !== null && row !== undefined && typeof row === 'object'
    ? (row as Record<string, unknown>)
    : null
}

/**
 * A dimension in whole millimetres.
 *
 * Falls back to the superseded centimetre column, converted, so a row written
 * before 112 still shows the right number in the form instead of an empty box
 * that silently discards it on the next save. Measured at the time of the
 * migration: zero of the 80 products carried any dimension, so this fallback
 * has no rows to act on today and exists for the ones a restore could bring
 * back.
 */
export function readDimensionMm(row: Row, dimension: 'length' | 'width' | 'height'): number | null {
  const r = record(row)
  if (!r) return null

  const mm = r[`${dimension}_mm`]
  if (typeof mm === 'number' && Number.isFinite(mm) && mm > 0) return Math.round(mm)

  const cm = r[`${dimension}_cm`]
  const parsed = typeof cm === 'number' ? cm : Number(cm)
  if (Number.isFinite(parsed) && parsed > 0) return Math.round(parsed * 10)

  return null
}

/** VAT exemption. Absent column reads as false: VAT applies unless exempted. */
export function readVatExempt(row: Row): boolean {
  return record(row)?.vat_exempt === true
}

/** Tags, always an array. A NULL or absent column is no tags, never a crash. */
export function readTags(row: Row): string[] {
  const value = record(row)?.tags
  if (!Array.isArray(value)) return []
  return value.filter((t): t is string => typeof t === 'string' && t.trim().length > 0)
}

/**
 * The stated basis of the struck-through price, raw, as the form re-shows it.
 * Both columns arrive with pending 242 and are absent from production today,
 * so an absent column reads as empty exactly like a NULL one.
 */
export function readOriginalPriceSourceFields(row: Row): { label: string; url: string } {
  const r = record(row)
  const label = r?.original_price_source
  const url = r?.original_price_source_url
  return {
    label: typeof label === 'string' ? label : '',
    url: typeof url === 'string' ? url : '',
  }
}

/** `products.city` as typed, trimmed; an absent or NULL column is an empty box. */
export function readCity(row: Row): string {
  const value = record(row)?.city
  return typeof value === 'string' ? value.trim() : ''
}

/**
 * `products.cashback_percent`, a percent, as production stores it (numeric,
 * NOT NULL DEFAULT 0 since 042). 059 would rename it to basis points and is
 * not applied; the form reads whichever is present through the same rule the
 * cart uses (CASHBACK_PERCENT_CANDIDATES in lib/supabase/optional-columns.ts).
 */
export function readCashbackPercent(row: Row): number {
  const r = record(row)
  if (!r) return 0
  if (r.cashback_bp !== undefined && r.cashback_bp !== null) {
    const bp = Number(r.cashback_bp)
    return Number.isFinite(bp) ? bp / 100 : 0
  }
  const percent = Number(r.cashback_percent)
  return Number.isFinite(percent) && percent > 0 ? percent : 0
}

/** Named here so the message and the file cannot drift apart (242). */
export const ORIGINAL_PRICE_SOURCE_MIGRATION_FILE =
  'migrations/pending/242_product_price_source_google_reviews.sql'

// One template literal, never several joined with `+` (STATE, template-literal trap).
export const ORIGINAL_PRICE_SOURCE_MIGRATION_NOTICE = `מקור המחיר הרגיל עדיין לא מופעל במסד הנתונים. יש להחיל את המיגרציה ${ORIGINAL_PRICE_SOURCE_MIGRATION_FILE} ואז לשמור שוב. שאר שדות המוצר נשמרים כרגיל.`
