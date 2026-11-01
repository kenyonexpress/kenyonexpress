/**
 * CSV column mapping and per-row validation for the product import.
 *
 * The one rule that matters: an imported row passes through the SAME
 * `productSchema` and the same `buildProductMoneyWrite` as the single-product
 * form. There is no second, looser validator for bulk data — a row that the
 * form would refuse is refused here with the same Hebrew message, and every
 * import lands as `draft`, so publishing still goes through the per-product
 * publish gate (supplier identity, split pair, coupon fields).
 *
 * `recurring` is deliberately not importable: its three columns arrive with
 * pending migration 135 and do not exist in production, so a CSV that could
 * create one would fail every insert on an un-migrated database.
 */

import { type ProductInput, productSchema } from '@/lib/admin/product-form-schema'
import { type ProductMoneyWrite, buildProductMoneyWrite } from '@/lib/commerce/product-money'

export const IMPORT_COLUMNS = [
  { key: 'slug', label: 'קישור (slug)', required: true },
  { key: 'name_he', label: 'שם בעברית', required: true },
  { key: 'name_en', label: 'שם באנגלית', required: false },
  { key: 'type', label: 'סוג (physical/coupon)', required: false },
  { key: 'kenyon_price', label: 'מחיר בקניון', required: true },
  { key: 'full_price', label: 'מחיר מלא', required: false },
  { key: 'platform_percent', label: 'עמלת פלטפורמה', required: true },
  { key: 'supplier_split_percent', label: 'אחוז לספק', required: false },
  { key: 'discount_percent', label: 'אחוז הנחה', required: false },
  { key: 'coupon_price_ils', label: 'מחיר קופון', required: false },
  { key: 'coupon_expiry_days', label: 'תוקף קופון בימים', required: false },
  { key: 'sku', label: 'מק"ט', required: false },
  { key: 'barcode', label: 'ברקוד', required: false },
  { key: 'stock_quantity', label: 'מלאי', required: false },
  { key: 'category', label: 'קטגוריה (שם מדויק)', required: false },
  { key: 'brand', label: 'מותג', required: false },
  { key: 'description_he', label: 'תיאור', required: false },
  { key: 'short_description_he', label: 'תיאור קצר', required: false },
  { key: 'tags', label: 'תגיות (מופרדות בפסיק)', required: false },
] as const

export type ImportColumnKey = (typeof IMPORT_COLUMNS)[number]['key']

export type ImportRecord = Partial<Record<ImportColumnKey, string>>

const COLUMN_LABELS: Record<string, string> = Object.fromEntries(
  IMPORT_COLUMNS.map((c) => [c.key, c.label]),
)

/**
 * Header aliases, all compared after `normalizeHeader`. Hebrew aliases exist
 * because the admin's spreadsheet is in Hebrew; the English keys exist so the
 * template round-trips and so an export from another system maps too.
 */
const HEADER_ALIASES: Record<string, ImportColumnKey> = {
  slug: 'slug',
  קישור: 'slug',
  name_he: 'name_he',
  name: 'name_he',
  שם: 'name_he',
  'שם מוצר': 'name_he',
  'שם בעברית': 'name_he',
  name_en: 'name_en',
  'שם באנגלית': 'name_en',
  type: 'type',
  סוג: 'type',
  kenyon_price: 'kenyon_price',
  price: 'kenyon_price',
  מחיר: 'kenyon_price',
  'מחיר בקניון': 'kenyon_price',
  full_price: 'full_price',
  'מחיר מלא': 'full_price',
  platform_percent: 'platform_percent',
  עמלה: 'platform_percent',
  'עמלת פלטפורמה': 'platform_percent',
  supplier_split_percent: 'supplier_split_percent',
  'אחוז לספק': 'supplier_split_percent',
  discount_percent: 'discount_percent',
  הנחה: 'discount_percent',
  'אחוז הנחה': 'discount_percent',
  coupon_price_ils: 'coupon_price_ils',
  'מחיר קופון': 'coupon_price_ils',
  coupon_expiry_days: 'coupon_expiry_days',
  'תוקף קופון': 'coupon_expiry_days',
  'תוקף קופון בימים': 'coupon_expiry_days',
  sku: 'sku',
  מקט: 'sku',
  'מק"ט': 'sku',
  barcode: 'barcode',
  ברקוד: 'barcode',
  stock_quantity: 'stock_quantity',
  stock: 'stock_quantity',
  מלאי: 'stock_quantity',
  category: 'category',
  קטגוריה: 'category',
  brand: 'brand',
  מותג: 'brand',
  description_he: 'description_he',
  description: 'description_he',
  תיאור: 'description_he',
  short_description_he: 'short_description_he',
  'תיאור קצר': 'short_description_he',
  tags: 'tags',
  תגיות: 'tags',
}

function normalizeHeader(raw: string): string {
  return raw
    .replace('﻿', '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

export interface HeaderMapping {
  /** Per input column: the canonical key, or null for an unrecognized header. */
  keys: (ImportColumnKey | null)[]
  unknown: string[]
  /** Required canonical columns absent from the header row. */
  missing: ImportColumnKey[]
}

export function mapHeaders(headerRow: string[]): HeaderMapping {
  const keys: (ImportColumnKey | null)[] = []
  const unknown: string[] = []
  const seen = new Set<ImportColumnKey>()
  for (const raw of headerRow) {
    const normalized = normalizeHeader(raw)
    // Aliases with spaces were normalized with `_` collapsed to `_`; try both
    // the space form and the underscore form so `kenyon price` matches too.
    const key = HEADER_ALIASES[normalized] ?? HEADER_ALIASES[normalized.replace(/ /g, '_')] ?? null
    if (key === null) {
      if (normalized.length > 0) unknown.push(raw.trim())
      keys.push(null)
      continue
    }
    // A duplicate header would silently overwrite the first column's value.
    keys.push(seen.has(key) ? null : key)
    seen.add(key)
  }
  const missing = IMPORT_COLUMNS.filter((c) => c.required && !seen.has(c.key)).map((c) => c.key)
  return { keys, unknown, missing }
}

export interface RawImportRow {
  /** 1-based line in the source file, for the admin's error report. */
  line: number
  record: ImportRecord
}

export function toRecords(
  mapping: HeaderMapping,
  dataRows: string[][],
  firstLine = 2,
): RawImportRow[] {
  const out: RawImportRow[] = []
  dataRows.forEach((cells, i) => {
    const record: ImportRecord = {}
    mapping.keys.forEach((key, col) => {
      if (key === null) return
      const value = (cells[col] ?? '').trim()
      if (value.length > 0) record[key] = value
    })
    // A row with nothing in any mapped column is not data: the CSV parser
    // already drops blank lines, and the xlsx parser keeps blank rows dense so
    // line numbers match Excel - both kinds end here, not in the error report.
    if (Object.keys(record).length === 0) return
    out.push({ line: firstLine + i, record })
  })
  return out
}

const TYPE_ALIASES: Record<string, 'physical' | 'coupon'> = {
  physical: 'physical',
  פיזי: 'physical',
  מוצר: 'physical',
  coupon: 'coupon',
  קופון: 'coupon',
}

/** How rows that already exist (by slug) are treated. */
export type ImportMode = 'insert' | 'upsert'

export interface ValidatedImportRow {
  line: number
  slug: string | null
  name: string | null
  errors: string[]
  /** Present only when errors is empty. */
  data?: ProductInput
  money?: ProductMoneyWrite
  /** Raw category name for the server to resolve to an id. */
  categoryName: string | null
  /**
   * The raw record, kept so the upsert path can tell "column absent from the
   * file" apart from "validated to a default" - only present columns may
   * overwrite an existing product.
   */
  record: ImportRecord
}

/**
 * Validates one record through productSchema + buildProductMoneyWrite.
 * Pure: slug uniqueness against the database is the server action's job.
 */
export function validateImportRow(row: RawImportRow): ValidatedImportRow {
  const r = row.record
  const errors: string[] = []

  // A missing required column is named HERE, by its spreadsheet label, before
  // anything downstream gets a chance to describe it in its own vocabulary.
  // productSchema carries defaults for some of these, so a blank cell parses
  // clean and the complaint surfaces much later from buildProductMoneyWrite as
  // "חייב להגדיר מחיר רגיל חיובי" -- true, Hebrew, and useless to someone
  // holding a 500-row CSV, because it names no column and no row can be found
  // from it.
  for (const column of IMPORT_COLUMNS) {
    if (!column.required) continue
    if ((r[column.key] ?? '').trim() === '') {
      errors.push(`${column.label}: ערך חסר`)
    }
  }

  const rawType = r.type?.trim().toLowerCase() ?? ''
  const type = rawType === '' ? 'physical' : (TYPE_ALIASES[rawType] ?? null)
  if (type === null) {
    errors.push(`סוג מוצר לא מוכר: "${r.type}". ערכים אפשריים: physical, coupon`)
  }

  const candidate = {
    supplier_id: null,
    category_id: null,
    slug: r.slug?.trim().toLowerCase(),
    name_he: r.name_he?.trim(),
    name_en: r.name_en || null,
    description_he: r.description_he || null,
    type: type ?? 'physical',
    kenyon_price: r.kenyon_price || undefined,
    full_price: r.full_price || null,
    platform_percent: r.platform_percent || undefined,
    supplier_split_percent: r.supplier_split_percent || null,
    discount_percent: r.discount_percent || null,
    coupon_price_ils: r.coupon_price_ils || null,
    coupon_expiry_days: r.coupon_expiry_days || null,
    is_coupon_enabled: type === 'coupon',
    sku: r.sku || null,
    stock_quantity: r.stock_quantity || null,
    is_featured: false,
    status: 'draft' as const,
    short_description_he: r.short_description_he || null,
    brand: r.brand || null,
    highlights: [],
    video_url: null,
    barcode: r.barcode || null,
    low_stock_threshold: 5,
    max_per_order: null,
    requires_shipping: type === 'physical',
    whatsapp_enabled: false,
    weight_grams: null,
    length_mm: null,
    width_mm: null,
    height_mm: null,
    vat_exempt: false,
    tags: [
      ...new Set(
        (r.tags ?? '')
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
      ),
    ],
    warranty_months: null,
    condition: null,
    coupon_terms_he: null,
    redemption_instructions_he: null,
    min_purchase_ils: null,
    seo_title: null,
    seo_description: null,
    seo_keywords: null,
  }

  const parsed = productSchema.safeParse(candidate)
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const field = String(issue.path[0] ?? '')
      const label = COLUMN_LABELS[field] ?? field
      // zod's defaults for missing/mistyped values are English ("Required",
      // "Expected number, received nan"); the admin reads Hebrew, so any
      // message without Hebrew in it is replaced and the column is named.
      const message = /[֐-׿]/.test(issue.message) ? issue.message : 'ערך חסר או לא תקין'
      errors.push(label ? `${label}: ${message}` : message)
    }
  }

  let money: ProductMoneyWrite | undefined
  if (parsed.success) {
    // Dry-run parity: the exact money derivation the insert will use, so a
    // money refusal shows up in the preview and not halfway through an import.
    const built = buildProductMoneyWrite({
      type: parsed.data.type,
      kenyonPrice: parsed.data.kenyon_price,
      platformPercent: parsed.data.platform_percent,
      supplierSplitPercent: parsed.data.supplier_split_percent,
      discountPercent: parsed.data.discount_percent,
      couponPriceIls: parsed.data.coupon_price_ils,
      couponExpiryDays: parsed.data.coupon_expiry_days,
      recurringAmountAgorot: null,
      billingInterval: null,
      billingIntervalCount: 1,
    })
    if (built.ok) {
      money = built.fields
    } else {
      errors.push(built.message)
    }
  }

  return {
    line: row.line,
    slug: candidate.slug ?? null,
    name: candidate.name_he ?? null,
    errors,
    ...(parsed.success && errors.length === 0 ? { data: parsed.data, money } : {}),
    categoryName: r.category?.trim() || null,
    record: r,
  }
}

/**
 * Money is derived as a unit by `buildProductMoneyWrite`, and its inputs are
 * required file columns - so an upsert always rewrites all of it, exactly as
 * the preview showed. Everything else overwrites only when its column was in
 * the file.
 */
const MONEY_SOURCE_FIELDS = [
  'kenyon_price',
  'full_price',
  'platform_percent',
  'supplier_split_percent',
  'discount_percent',
  'coupon_price_ils',
  'coupon_expiry_days',
  'is_coupon_enabled',
] as const

const PRESENCE_UPDATE_FIELDS = [
  'name_he',
  'name_en',
  'description_he',
  'short_description_he',
  'brand',
  'sku',
  'barcode',
  'stock_quantity',
  'tags',
] as const

/**
 * The column set an upsert writes to an EXISTING product. Deliberately no
 * status, images, supplier, created_by or type: a CSV update must not
 * unpublish a live product, drop its gallery, or change what it is.
 * Category is the server's to add - it owns the name -> id map.
 */
export function buildUpsertUpdateFields(row: ValidatedImportRow): Record<string, unknown> | null {
  if (!row.data || !row.money) return null
  const out: Record<string, unknown> = {}
  for (const field of MONEY_SOURCE_FIELDS) out[field] = row.data[field]
  for (const field of PRESENCE_UPDATE_FIELDS) {
    if (row.record[field] !== undefined) out[field] = row.data[field]
  }
  Object.assign(out, row.money)
  return out
}

/** Flags rows whose slug or sku repeats an EARLIER row in the same file. */
export function markInFileDuplicates(rows: ValidatedImportRow[]): ValidatedImportRow[] {
  const slugs = new Map<string, number>()
  const skus = new Map<string, number>()
  return rows.map((row) => {
    const errors = [...row.errors]
    if (row.slug) {
      const first = slugs.get(row.slug)
      if (first !== undefined) {
        errors.push(`קישור (slug) כפול בקובץ - הופיע כבר בשורה ${first}`)
      } else {
        slugs.set(row.slug, row.line)
      }
    }
    const sku = row.data?.sku ?? null
    if (sku) {
      const first = skus.get(sku)
      if (first !== undefined) {
        errors.push(`מק"ט כפול בקובץ - הופיע כבר בשורה ${first}`)
      } else {
        skus.set(sku, row.line)
      }
    }
    if (errors.length === row.errors.length) return row
    const { data: _data, money: _money, ...rest } = row
    return { ...rest, errors }
  })
}

function csvEscape(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

/** The downloadable template: canonical headers plus two example rows. */
export function buildTemplateCsv(): string {
  const header = IMPORT_COLUMNS.map((c) => c.key)
  const physical = [
    'example-product',
    'מוצר לדוגמה',
    'Example Product',
    'physical',
    '199.90',
    '249.90',
    '30',
    '70',
    '10',
    '',
    '',
    'SKU-001',
    '7290000000001',
    '25',
    '',
    'מותג לדוגמה',
    'תיאור מלא של המוצר',
    'תיאור קצר',
    'חדש,מבצע',
  ]
  const coupon = [
    'example-coupon',
    'קופון לדוגמה',
    '',
    'coupon',
    '100',
    '',
    '25',
    '75',
    '',
    '35',
    '60',
    '',
    '',
    '',
    '',
    '',
    'שובר הנחה לבית העסק',
    '',
    '',
  ]
  return `﻿${[header, physical, coupon].map((row) => row.map(csvEscape).join(',')).join('\r\n')}\r\n`
}

export interface ErrorReportEntry {
  line: number
  slug: string | null
  name: string | null
  errors: string[]
}

/** The error report the admin downloads: one row per failed line, Hebrew, BOM for Excel. */
export function buildErrorReportCsv(entries: ErrorReportEntry[]): string {
  const header = ['שורה', 'קישור (slug)', 'שם', 'שגיאות']
  const lines = entries.map((e) =>
    [String(e.line), e.slug ?? '', e.name ?? '', e.errors.join(' | ')].map(csvEscape).join(','),
  )
  return `﻿${[header.map(csvEscape).join(','), ...lines].join('\r\n')}\r\n`
}
