/**
 * CSV bulk import for the admin catalogue.
 *
 * This module only parses and maps. Validation, money and approval policy stay
 * in the single product write path: each row becomes the same FormData the
 * product form posts, so a CSV row cannot do anything the form could not.
 * Prices stay decimal strings here; money.ts converts them at the write edge.
 */

export const PRODUCT_CSV_MAX_ROWS = 200

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
] as const

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
    csv.header.forEach((name, col) => {
      if (!known.has(name)) return
      const value = (cells[col] ?? '').trim()
      if (value !== '') form.set(name, value)
    })
    form.set('status', 'draft')
    const bad = (['slug', 'name_he', 'type', 'kenyon_price'] as const).find((k) => !form.get(k))
    if (bad) return { ok: false, line, error: `שורה ${line}: חסר ${bad}` }
    return { ok: true, line, form }
  })

  return { ok: true, rows, unknownColumns }
}
