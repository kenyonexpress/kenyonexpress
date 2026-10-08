import type { CompareViewItem } from '@/lib/compare/view'
import { shekelsFromIlsRounded } from '@/lib/money-format'

/**
 * The attribute rows of the compare table, built from the columns.
 *
 * A row is one label and one cell per product, in column order. `allSame`
 * is what the "הצג הבדלים בלבד" switch hides on: a row where every column
 * says the same thing (or nothing) tells the shopper nothing about the
 * choice, and with four coupons from one category that is most rows.
 *
 * ROW ORDER IS THE READING ORDER. Price first, because it is what the
 * shopper is comparing; then what they get for it; then where and from whom;
 * then the product's own attributes, whose union across the four columns
 * forms the tail (a label one product lacks shows "—" in its cell).
 */

export interface CompareRow {
  key: string
  label: string
  /** One cell per column, `null` where the product has no value. */
  cells: (string | null)[]
  allSame: boolean
}

const EMPTY = '—'

function same(cells: (string | null)[]): boolean {
  if (cells.length < 2) return true
  const first = cells[0] ?? null
  return cells.every((c) => (c ?? null) === first)
}

function row(key: string, label: string, cells: (string | null)[]): CompareRow {
  return { key, label, cells, allSame: same(cells) }
}

function percent(n: number | null): string | null {
  if (n === null || !Number.isFinite(n) || n <= 0) return null
  return `${Math.round(n)}%`
}

export function buildCompareRows(items: CompareViewItem[]): CompareRow[] {
  const rows: CompareRow[] = [
    row(
      'price',
      'מחיר',
      items.map((i) => (i.priceIls === null ? null : shekelsFromIlsRounded(i.priceIls))),
    ),
    row(
      'full_price',
      'מחיר מלא',
      items.map((i) => (i.fullPriceIls === null ? null : shekelsFromIlsRounded(i.fullPriceIls))),
    ),
    row(
      'discount',
      'הנחה',
      items.map((i) => percent(i.discountPercent)),
    ),
    row(
      'availability',
      'זמינות',
      items.map((i) => (i.available ? 'במלאי' : i.soldOut ? 'אזל מהמלאי' : 'לא זמין')),
    ),
    row(
      'type',
      'סוג',
      items.map((i) => i.typeLabel),
    ),
    row(
      'cashback',
      'קאשבק',
      items.map((i) => percent(i.cashbackPercent)),
    ),
    row(
      'shipping',
      'משלוח',
      items.map((i) => (i.requiresShipping ? 'נשלח' : 'ללא משלוח')),
    ),
    row(
      'category',
      'קטגוריה',
      items.map((i) => i.categoryName),
    ),
    row(
      'supplier',
      'ספק',
      items.map((i) => i.supplierName),
    ),
    row(
      'brand',
      'מותג',
      items.map((i) => i.brand),
    ),
    row(
      'city',
      'עיר',
      items.map((i) => i.city),
    ),
    row(
      'sku',
      'מק"ט',
      items.map((i) => i.sku),
    ),
    row(
      'highlights',
      'דגשים',
      items.map((i) => (i.highlights.length ? i.highlights.join(' · ') : null)),
    ),
    row(
      'description',
      'תיאור קצר',
      items.map((i) => i.shortDescription),
    ),
  ]

  // The union of the products' own attribute labels, in first-seen order.
  const labels: string[] = []
  for (const item of items) {
    for (const a of item.attributes) if (!labels.includes(a.label)) labels.push(a.label)
  }
  for (const label of labels) {
    rows.push(
      row(
        `attr:${label}`,
        label,
        items.map((i) => i.attributes.find((a) => a.label === label)?.value ?? null),
      ),
    )
  }

  // A row nobody filled is not a difference and not information either.
  return rows.filter((r) => r.cells.some((c) => c !== null))
}

/** What a `null` cell paints. */
export const EMPTY_CELL = EMPTY
