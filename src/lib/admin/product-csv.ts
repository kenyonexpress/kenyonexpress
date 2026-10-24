import { cadenceFromDays, parseLogisticsFields } from './product-logistics-fields'

/**
 * CSV bulk import for the admin catalogue.
 *
 * This module only parses and maps. Validation, money and approval policy stay
 * in the single product write path: each row becomes the same FormData the
 * product form posts, so a CSV row cannot do anything the form could not.
 * Prices stay decimal strings here; money.ts converts them at the write edge.
 */

export const PRODUCT_CSV_MAX_ROWS = 200

/** Mirrors the `type` enum of the product form schema. */
const PRODUCT_CSV_TYPES: readonly string[] = ['physical', 'coupon', 'recurring']

/** Header name -> form field. Anything else is reported, not silently dropped. */
export const PRODUCT_CSV_COLUMNS = [
  'slug',
  'name_he',
  'type',
  'kenyon_price',
  'full_price',
  'platform_percent',
  'supplier_split_percent',
  'supplier_id',
  'category_id',
  'coupon_expiry_days',
  'coupon_price_ils',
  'stock_quantity',
  'sku',
  'short_description_he',
  'description_he',
  'brand',
  'requires_shipping',
  // rc5 F06: migrations 185, 187, 278 and the live geo columns.
  'cancellation_window_days',
  'payout_cadence',
  'payout_cadence_days',
  'shipping_price_agorot',
  'city',
  'full_address',
  'lat',
  'lng',
  'latitude',
  'longitude',
] as const

/** CSV spellings stored under another form field name. */
const COLUMN_ALIASES: Record<string, string> = { lat: 'latitude', lng: 'longitude' }

export type ProductCsvColumn = (typeof PRODUCT_CSV_COLUMNS)[number]

export type ParsedCsv = { header: string[]; rows: string[][] }

/** RFC 4180: quoted fields, doubled quotes, CRLF or LF, optional BOM. */
export function parseCsv(input: string): ParsedCsv {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input
  const records: string[][] = []
  let field = ''
  let record: string[] = []
  let quoted = false

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else quoted = false
      } else field += ch
    } else if (ch === '"') quoted = true
    else if (ch === ',') {
      record.push(field)
      field = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      record.push(field)
      field = ''
      records.push(record)
      record = []
    } else field += ch
  }
  if (field !== '' || record.length > 0) {
    record.push(field)
    records.push(record)
  }

  const nonEmpty = records.filter((r) => r.some((c) => c.trim() !== ''))
  const [header = [], ...rows] = nonEmpty
  return { header: header.map((h) => h.trim()), rows }
}

export type CsvRowResult =
  | { ok: true; line: number; form: FormData }
  | { ok: false; line: number; error: string }

export type CsvMapResult =
  | { ok: true; rows: CsvRowResult[]; unknownColumns: string[] }
  | { ok: false; error: string }

/** Rows are always created as drafts: publishing stays a deliberate admin act. */
export function mapCsvToForms(csv: ParsedCsv): CsvMapResult {
  const known = new Set<string>(PRODUCT_CSV_COLUMNS)
  const unknownColumns = csv.header.filter((h) => h !== '' && !known.has(h))
  for (const required of ['slug', 'name_he', 'type', 'kenyon_price'] as const) {
    if (!csv.header.includes(required)) {
      return { ok: false, error: `חסרה עמודה חובה: ${required}` }
    }
  }
  if (csv.rows.length === 0) return { ok: false, error: 'הקובץ אינו מכיל שורות' }
  if (csv.rows.length > PRODUCT_CSV_MAX_ROWS) {
    return { ok: false, error: `מעל ${PRODUCT_CSV_MAX_ROWS} שורות בקובץ אחד` }
  }

  const rows = csv.rows.map((cells, index): CsvRowResult => {
    const line = index + 2
    const form = new FormData()
    let cadenceError: string | null = null
    csv.header.forEach((name, col) => {
      if (!known.has(name)) return
      const value = (cells[col] ?? '').trim()
      if (value === '') return
      if (name === 'payout_cadence_days') {
        const cadence = cadenceFromDays(value)
        if (cadence) form.set('payout_cadence', cadence)
        else cadenceError = 'payout_cadence_days חייב להיות 7, 14 או 30'
        return
      }
      form.set(COLUMN_ALIASES[name] ?? name, value)
    })
    form.set('status', 'draft')
    const bad = (['slug', 'name_he', 'type', 'kenyon_price'] as const).find((k) => !form.get(k))
    if (bad) return { ok: false, line, error: `שורה ${line}: חסר ${bad}` }
    const invalid = cadenceError ?? validateRow(form)
    if (invalid) return { ok: false, line, error: `שורה ${line}: ${invalid}` }
    return { ok: true, line, form }
  })

  return { ok: true, rows, unknownColumns }
}

/**
 * Checks a mapped row before anything is written, so the dry-run preview shows
 * every problem and a commit never half-imports a file on a typo. The product
 * schema re-checks on write; this is the early, per-row answer.
 */
export function validateRow(form: FormData): string | null {
  const logistics = parseLogisticsFields(form)
  if (!logistics.ok) return logistics.error

  const lat = form.get('latitude')
  const lng = form.get('longitude')
  if ((lat == null) !== (lng == null)) return 'יש להזין lat ו-lng יחד'
  if (lat != null && lng != null) {
    const la = Number(lat)
    const lo = Number(lng)
    if (!Number.isFinite(la) || la < -90 || la > 90) return 'lat לא תקין'
    if (!Number.isFinite(lo) || lo < -180 || lo > 180) return 'lng לא תקין'
  }
  const city = form.get('city')
  if (typeof city === 'string' && city.length > 60) return 'שם עיר עד 60 תווים'
  const type = form.get('type')
  if (typeof type === 'string' && !PRODUCT_CSV_TYPES.includes(type)) {
    return `type חייב להיות אחד מ: ${PRODUCT_CSV_TYPES.join(', ')}`
  }
  const price = form.get('kenyon_price')
  if (typeof price === 'string' && !/^\d+(\.\d{1,2})?$/.test(price)) {
    return 'kenyon_price חייב להיות מספר חיובי עם עד שתי ספרות אחרי הנקודה'
  }
  const percent = form.get('platform_percent')
  if (percent != null) {
    const p = Number(percent)
    if (!Number.isFinite(p) || p < 0 || p > 100) return 'platform_percent בין 0 ל-100'
  }
  return null
}

/** The fields the dry-run preview shows for a row. */
export function previewRow(form: FormData): Record<string, string> {
  const pick = [
    'slug',
    'name_he',
    'type',
    'kenyon_price',
    'platform_percent',
    'city',
    'shipping_price_agorot',
    'cancellation_window_days',
    'payout_cadence',
  ]
  const out: Record<string, string> = {}
  for (const key of pick) {
    const v = form.get(key)
    if (typeof v === 'string') out[key] = v
  }
  return out
}
