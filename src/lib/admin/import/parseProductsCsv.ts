import { inflateRawSync } from 'node:zlib'
import { z } from 'zod'

/**
 * Admin product import parser. Accepts a raw upload buffer that is either a
 * CSV (UTF-8, RFC 4180 quoting) or an Excel workbook (.xlsx), validates every
 * data row with zod, and returns the typed rows alongside a per-row error
 * report keyed by the physical row number the admin sees in Excel.
 *
 * Zero dependencies on purpose: the repo has no spreadsheet library, and an
 * .xlsx file is a zip of XML that node:zlib can inflate on its own. Only the
 * .xls binary format (OLE compound file) is out of reach and is rejected with
 * an explicit message.
 *
 * Prices are validated here but NOT converted: the CSV carries shekels, the
 * same unit the admin product form types, and the shekel→agorot conversion
 * must go through src/lib/money.ts at write time, exactly like the form path.
 */

function emptyToNull(value: unknown): unknown {
  if (value === '' || value === null || value === undefined) return null
  return value
}

export const productImportRowSchema = z.object({
  slug: z
    .string()
    .trim()
    .min(2, 'קישור חייב להכיל לפחות 2 תווים')
    .regex(/^[a-z0-9-]+$/, 'קישור יכול להכיל אותיות לועזיות, מספרים ומקפים בלבד'),
  name_he: z.string().trim().min(2, 'שם חייב להכיל לפחות 2 תווים'),
  name_en: z.preprocess(emptyToNull, z.string().nullable().optional()),
  description_he: z.preprocess(emptyToNull, z.string().nullable().optional()),
  type: z.enum(['physical', 'coupon', 'recurring'], {
    errorMap: () => ({ message: 'סוג מוצר חייב להיות physical, coupon או recurring' }),
  }),
  kenyon_price: z.preprocess(
    emptyToNull,
    z.coerce
      .number({ invalid_type_error: 'מחיר בקניון חייב להיות מספר' })
      .min(0, 'מחיר לא יכול להיות שלילי')
      .nullable()
      .optional(),
  ),
  full_price: z.preprocess(
    emptyToNull,
    z.coerce
      .number({ invalid_type_error: 'מחיר מלא חייב להיות מספר' })
      .min(0, 'מחיר לא יכול להיות שלילי')
      .nullable()
      .optional(),
  ),
  platform_percent: z.preprocess(
    emptyToNull,
    z.coerce
      .number({ invalid_type_error: 'עמלת פלטפורמה חייבת להיות מספר' })
      .min(0, 'עמלה לא יכולה להיות שלילית')
      .max(100, 'עמלה לא יכולה לעלות על 100')
      .nullable()
      .optional(),
  ),
})

export type ProductImportRow = z.infer<typeof productImportRowSchema>

export interface ProductImportRowError {
  /** 1-based physical row in the source file, as Excel numbers it. 0 = file-level error. */
  row: number
  /** Offending column name, or null for file-level / whole-row problems. */
  column: string | null
  message: string
}

export interface ParseProductsResult {
  rows: ProductImportRow[]
  errors: ProductImportRowError[]
  /** Non-blank rows below the header, valid or not. */
  totalDataRows: number
}

const REQUIRED_COLUMNS = ['slug', 'name_he', 'type'] as const
const KNOWN_COLUMNS = Object.keys(productImportRowSchema.shape)

export function parseProductsCsv(input: Buffer | Uint8Array): ParseProductsResult {
  const buffer = Buffer.isBuffer(input) ? input : Buffer.from(input)
  if (buffer.length === 0) return fileError('הקובץ ריק')

  let grid: string[][]
  if (buffer.length >= 4 && buffer.readUInt32LE(0) === ZIP_LOCAL_SIG) {
    try {
      grid = readXlsxGrid(buffer)
    } catch {
      return fileError('קובץ ה-Excel פגום או בפורמט שאינו נתמך')
    }
  } else if (buffer.length >= 4 && buffer.readUInt32BE(0) === OLE_SIG) {
    return fileError('קובץ ‎.xls ישן אינו נתמך. יש לשמור מחדש כ-xlsx או CSV')
  } else {
    grid = parseCsvGrid(stripBom(buffer.toString('utf8')))
  }

  return validateGrid(grid)
}

function fileError(message: string): ParseProductsResult {
  return { rows: [], errors: [{ row: 0, column: null, message }], totalDataRows: 0 }
}

// ── Validation over a cell grid (shared by both formats) ─────────────────────

function validateGrid(grid: string[][]): ParseProductsResult {
  const headerIndex = grid.findIndex((row) => row.some((cell) => cell.trim() !== ''))
  if (headerIndex === -1) return fileError('הקובץ ריק')

  const header = (grid[headerIndex] ?? []).map((cell) => cell.trim().toLowerCase())
  const columnOf = new Map<string, number>()
  for (const [index, name] of header.entries()) {
    if (KNOWN_COLUMNS.includes(name) && !columnOf.has(name)) columnOf.set(name, index)
  }

  const missing = REQUIRED_COLUMNS.filter((name) => !columnOf.has(name))
  if (missing.length > 0) {
    return fileError(`חסרות עמודות חובה: ${missing.join(', ')}`)
  }

  const rows: ProductImportRow[] = []
  const errors: ProductImportRowError[] = []
  let totalDataRows = 0

  for (let i = headerIndex + 1; i < grid.length; i++) {
    const cells = grid[i] ?? []
    if (cells.every((cell) => cell.trim() === '')) continue
    totalDataRows++
    const physicalRow = i + 1

    const record: Record<string, string> = {}
    for (const [name, index] of columnOf) {
      record[name] = (cells[index] ?? '').trim()
    }

    const parsed = productImportRowSchema.safeParse(record)
    if (parsed.success) {
      rows.push(parsed.data)
    } else {
      for (const issue of parsed.error.issues) {
        errors.push({
          row: physicalRow,
          column: typeof issue.path[0] === 'string' ? issue.path[0] : null,
          message: issue.message,
        })
      }
    }
  }

  return { rows, errors, totalDataRows }
}

// ── CSV (RFC 4180: quoted fields, escaped quotes, embedded newlines) ─────────

function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
}

function parseCsvGrid(text: string): string[][] {
  const grid: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false

  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += char
      }
    } else if (char === '"' && field === '') {
      inQuotes = true
    } else if (char === ',') {
      row.push(field)
      field = ''
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i++
      row.push(field)
      field = ''
      grid.push(row)
      row = []
    } else {
      field += char
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field)
    grid.push(row)
  }
  return grid
}

// ── XLSX: a zip whose entries we inflate with node:zlib ──────────────────────

const ZIP_LOCAL_SIG = 0x04034b50
const ZIP_CENTRAL_SIG = 0x02014b50
const ZIP_EOCD_SIG = 0x06054b50
const OLE_SIG = 0xd0cf11e0

interface ZipEntry {
  method: number
  dataStart: number
  compressedSize: number
}

function readZipEntries(buffer: Buffer): Map<string, ZipEntry> {
  let eocd = -1
  const floor = Math.max(0, buffer.length - 22 - 0xffff)
  for (let i = buffer.length - 22; i >= floor; i--) {
    if (buffer.readUInt32LE(i) === ZIP_EOCD_SIG) {
      eocd = i
      break
    }
  }
  if (eocd === -1) throw new Error('no end-of-central-directory record')

  const entryCount = buffer.readUInt16LE(eocd + 10)
  let p = buffer.readUInt32LE(eocd + 16)
  const entries = new Map<string, ZipEntry>()

  for (let n = 0; n < entryCount; n++) {
    if (buffer.readUInt32LE(p) !== ZIP_CENTRAL_SIG) throw new Error('bad central directory')
    const method = buffer.readUInt16LE(p + 10)
    const compressedSize = buffer.readUInt32LE(p + 20)
    const nameLength = buffer.readUInt16LE(p + 28)
    const extraLength = buffer.readUInt16LE(p + 30)
    const commentLength = buffer.readUInt16LE(p + 32)
    const localOffset = buffer.readUInt32LE(p + 42)
    const name = buffer.subarray(p + 46, p + 46 + nameLength).toString('utf8')

    const localNameLength = buffer.readUInt16LE(localOffset + 26)
    const localExtraLength = buffer.readUInt16LE(localOffset + 28)
    entries.set(name, {
      method,
      dataStart: localOffset + 30 + localNameLength + localExtraLength,
      compressedSize,
    })
    p += 46 + nameLength + extraLength + commentLength
  }
  return entries
}

function readZipFile(buffer: Buffer, entry: ZipEntry): Buffer {
  const raw = buffer.subarray(entry.dataStart, entry.dataStart + entry.compressedSize)
  if (entry.method === 0) return Buffer.from(raw)
  if (entry.method === 8) return inflateRawSync(raw)
  throw new Error(`unsupported zip compression method ${entry.method}`)
}

function readXlsxGrid(buffer: Buffer): string[][] {
  const entries = readZipEntries(buffer)

  const sheetName = entries.has('xl/worksheets/sheet1.xml')
    ? 'xl/worksheets/sheet1.xml'
    : [...entries.keys()].filter((name) => /^xl\/worksheets\/sheet\d+\.xml$/.test(name)).sort()[0]
  const sheetEntry = sheetName ? entries.get(sheetName) : undefined
  if (!sheetEntry) throw new Error('no worksheet in workbook')

  const sharedEntry = entries.get('xl/sharedStrings.xml')
  const shared = sharedEntry
    ? parseSharedStrings(readZipFile(buffer, sharedEntry).toString('utf8'))
    : []

  return parseSheetXml(readZipFile(buffer, sheetEntry).toString('utf8'), shared)
}

function parseSharedStrings(xml: string): string[] {
  const strings: string[] = []
  for (const item of xml.matchAll(/<si(?:\s[^>]*)?>([\s\S]*?)<\/si>/g)) {
    strings.push(extractTexts(item[1] ?? ''))
  }
  return strings
}

/** Concatenates every <t> run inside a shared-string item or inline string. */
function extractTexts(xml: string): string {
  let text = ''
  for (const t of xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)) {
    text += unescapeXml(t[1] ?? '')
  }
  return text
}

function parseSheetXml(xml: string, shared: string[]): string[][] {
  const grid: string[][] = []
  for (const rowMatch of xml.matchAll(/<row(\s[^>]*)?>([\s\S]*?)<\/row>/g)) {
    // Excel omits blank rows entirely; the r attribute keeps physical numbering
    // honest so error reports point at the row the admin actually sees.
    const rowRef = /(?:^|\s)r="(\d+)"/.exec(rowMatch[1] ?? '')
    const rowNumber = rowRef ? Number(rowRef[1]) : grid.length + 1
    while (grid.length < rowNumber - 1) grid.push([])

    const cells: string[] = []
    let nextColumn = 0
    const rowXml = rowMatch[2] ?? ''
    for (const cellMatch of rowXml.matchAll(/<c(\s[^>]*)?\/>|<c(\s[^>]*)?>([\s\S]*?)<\/c>/g)) {
      const attrs = cellMatch[1] ?? cellMatch[2] ?? ''
      const inner = cellMatch[3] ?? ''
      const cellLetters = /(?:^|\s)r="([A-Z]+)\d+"/.exec(attrs)?.[1]
      const column = cellLetters ? columnIndex(cellLetters) : nextColumn
      nextColumn = column + 1
      cells[column] = cellValue(attrs, inner, shared)
    }
    grid.push(Array.from(cells, (cell) => cell ?? ''))
  }
  return grid
}

function cellValue(attrs: string, inner: string, shared: string[]): string {
  const type = /(?:^|\s)t="([^"]+)"/.exec(attrs)?.[1] ?? 'n'
  if (type === 'inlineStr') return extractTexts(inner)
  const value = /<v(?:\s[^>]*)?>([\s\S]*?)<\/v>/.exec(inner)?.[1] ?? ''
  if (type === 's') return shared[Number(value)] ?? ''
  if (type === 'b') return value === '1' ? 'true' : 'false'
  return unescapeXml(value)
}

function columnIndex(letters: string): number {
  let index = 0
  for (const letter of letters) {
    index = index * 26 + (letter.charCodeAt(0) - 64)
  }
  return index - 1
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
}

function unescapeXml(text: string): string {
  return text.replace(/&(amp|lt|gt|quot|apos|#x?[0-9a-fA-F]+);/g, (match, entity: string) => {
    if (entity[0] !== '#') return NAMED_ENTITIES[entity] ?? match
    const code =
      entity[1] === 'x'
        ? Number.parseInt(entity.slice(2), 16)
        : Number.parseInt(entity.slice(1), 10)
    return String.fromCodePoint(code)
  })
}
