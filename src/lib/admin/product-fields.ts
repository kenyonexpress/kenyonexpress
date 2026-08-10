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
