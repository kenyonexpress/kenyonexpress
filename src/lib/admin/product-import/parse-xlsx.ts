/**
 * Minimal .xlsx reader for the product import screen.
 *
 * Written by hand for the same reason `parse-csv.ts` is: the alternatives are
 * a CDN-only SheetJS build or a multi-megabyte exceljs bundle shipped to the
 * browser, and the import needs exactly one thing from the format - the first
 * worksheet as a `string[][]`. An .xlsx file is a zip; the entries this reads
 * are `xl/workbook.xml` (sheet order), `xl/_rels/workbook.xml.rels` (sheet
 * paths), `xl/sharedStrings.xml` and the first sheet. Inflation goes through
 * the platform's `DecompressionStream('deflate-raw')`, which exists in every
 * browser this admin panel supports and in Node for the tests - no
 * dependency, no bundled inflater.
 *
 * Deliberately NOT a general reader: no zip64 (a 4GB spreadsheet is a wrong
 * file, not a use case), no cell styles, no date formatting (no import column
 * is a date), and formula cells contribute their cached `<v>` value. Rows are
 * returned dense - a blank Excel row stays as an empty array - so a row's
 * index is its true 1-based Excel row number and the error report matches
 * what the admin sees in Excel. `toRecords` drops the all-empty rows later.
 */

export interface XlsxParseError {
  /** 1-based Excel row of the offending cell. */
  line: number
  message: string
}

export interface XlsxParseResult {
  /** Dense rows from Excel row 1, header included; blank rows are `[]`. */
  rows: string[][]
  errors: XlsxParseError[]
  truncated: boolean
}

export interface XlsxParserOptions {
  /** Hard cap on emitted rows, header included. Guards memory on a wrong file. */
  maxRows?: number
  /** Hard cap on a single cell's length. */
  maxFieldLength?: number
}

const DEFAULT_MAX_ROWS = 5001 // header + 5000 data rows, same as the CSV parser
const DEFAULT_MAX_FIELD_LENGTH = 10_000

/** Structural failure: not a zip, not a workbook, unsupported compression. */
export class XlsxFormatError extends Error {}

const EOCD_SIG = 0x06054b50
const CENTRAL_SIG = 0x02014b50
const LOCAL_SIG = 0x04034b50

interface ZipEntry {
  method: number
  compressedSize: number
  localOffset: number
}

function readZipDirectory(bytes: Uint8Array, view: DataView): Map<string, ZipEntry> {
  // The end-of-central-directory record sits at the very end, behind an
  // optional comment of up to 64KB; scan backwards for its signature.
  const scanFloor = Math.max(0, bytes.length - 22 - 0xffff)
  let eocd = -1
  for (let i = bytes.length - 22; i >= scanFloor; i--) {
    if (view.getUint32(i, true) === EOCD_SIG) {
      eocd = i
      break
    }
  }
  if (eocd < 0) throw new XlsxFormatError('הקובץ אינו קובץ xlsx תקין (לא נמצא מבנה zip)')

  const count = view.getUint16(eocd + 10, true)
  let pos = view.getUint32(eocd + 16, true)
  const entries = new Map<string, ZipEntry>()
  const utf8 = new TextDecoder('utf-8')
  for (let i = 0; i < count; i++) {
    if (pos + 46 > bytes.length || view.getUint32(pos, true) !== CENTRAL_SIG) {
      throw new XlsxFormatError('הקובץ אינו קובץ xlsx תקין (תוכן העניינים של ה-zip פגום)')
    }
    const method = view.getUint16(pos + 10, true)
    const compressedSize = view.getUint32(pos + 20, true)
    const nameLength = view.getUint16(pos + 28, true)
    const extraLength = view.getUint16(pos + 30, true)
    const commentLength = view.getUint16(pos + 32, true)
    const localOffset = view.getUint32(pos + 42, true)
    if (compressedSize === 0xffffffff || localOffset === 0xffffffff) {
      throw new XlsxFormatError('קובץ xlsx גדול מדי (zip64 אינו נתמך)')
    }
    const name = utf8.decode(bytes.subarray(pos + 46, pos + 46 + nameLength))
    entries.set(name, { method, compressedSize, localOffset })
    pos += 46 + nameLength + extraLength + commentLength
  }
  return entries
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const stream = new DecompressionStream('deflate-raw')
  const writer = stream.writable.getWriter()
  // Not awaited before reading: awaiting write() first can deadlock on
  // backpressure. The promise is joined after the read loop so a corrupt
  // entry still rejects here rather than as an unhandled rejection.
  const writing = writer.write(data as BufferSource).then(() => writer.close())
  const reader = stream.readable.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    total += value.length
  }
  await writing
  const out = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    out.set(chunk, offset)
    offset += chunk.length
  }
  return out
}

async function readEntryText(bytes: Uint8Array, view: DataView, entry: ZipEntry): Promise<string> {
  // Sizes come from the central directory: the local header is allowed to
  // carry zeros and defer them to a data descriptor, which Excel does use.
  const p = entry.localOffset
  if (p + 30 > bytes.length || view.getUint32(p, true) !== LOCAL_SIG) {
    throw new XlsxFormatError('הקובץ אינו קובץ xlsx תקין (כותרת רשומה פגומה)')
  }
  const nameLength = view.getUint16(p + 26, true)
  const extraLength = view.getUint16(p + 28, true)
  const start = p + 30 + nameLength + extraLength
  const raw = bytes.subarray(start, start + entry.compressedSize)
  let data: Uint8Array
  if (entry.method === 0) data = raw
  else if (entry.method === 8) data = await inflateRaw(raw)
  else throw new XlsxFormatError('קובץ xlsx עם דחיסה לא נתמכת')
  return new TextDecoder('utf-8').decode(data).replace(/^﻿/, '')
}

const XML_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
}

/** Decodes XML entities plus Excel's `_xHHHH_` control-character escape. */
function decodeXml(text: string): string {
  return text
    .replace(/&(#x?[0-9a-fA-F]+|[a-z]+);/g, (whole, body: string) => {
      if (body.startsWith('#x') || body.startsWith('#X')) {
        return String.fromCodePoint(Number.parseInt(body.slice(2), 16))
      }
      if (body.startsWith('#')) return String.fromCodePoint(Number.parseInt(body.slice(1), 10))
      return XML_ENTITIES[body] ?? whole
    })
    .replace(/_x([0-9A-Fa-f]{4})_/g, (_, hex: string) =>
      String.fromCharCode(Number.parseInt(hex, 16)),
    )
}

function attrOf(tag: string, name: string): string | null {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const m = tag.match(new RegExp(`(?:^|\\s)${escaped}="([^"]*)"`))
  return m ? decodeXml(m[1] ?? '') : null
}

/** Concatenates every `<t>` run inside a shared/inline string item. */
function textRuns(inner: string): string {
  let out = ''
  for (const m of inner.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)) {
    out += decodeXml(m[1] ?? '')
  }
  return out
}

function parseSharedStrings(xml: string | null): string[] {
  if (!xml) return []
  const out: string[] = []
  for (const m of xml.matchAll(/<si(?:\s[^>]*)?>([\s\S]*?)<\/si>/g)) {
    out.push(textRuns(m[1] ?? ''))
  }
  return out
}

/** `"A"` -> 0, `"AB"` -> 27. */
function columnIndex(ref: string): number {
  let n = 0
  for (const ch of ref) n = n * 26 + (ch.charCodeAt(0) - 64)
  return n - 1
}

/** Resolves the workbook's FIRST sheet (tab order) to its zip entry path. */
function firstSheetPath(workbookXml: string, relsXml: string | null): string {
  const sheetTag = workbookXml.match(/<sheet\s[^>]*?\/?>/)?.[0]
  if (!sheetTag) throw new XlsxFormatError('קובץ xlsx בלי אף גיליון')
  const relId = attrOf(sheetTag, 'r:id')
  if (relId && relsXml) {
    for (const rel of relsXml.matchAll(/<Relationship\s[^>]*?\/?>/g)) {
      if (attrOf(rel[0], 'Id') === relId) {
        const target = attrOf(rel[0], 'Target') ?? ''
        const clean = target.replace(/^\//, '')
        return clean.startsWith('xl/') ? clean : `xl/${clean}`
      }
    }
  }
  // Older writers omit rels the parser can use; the conventional path is a
  // fair fallback because Excel itself always writes it.
  return 'xl/worksheets/sheet1.xml'
}

export async function parseXlsx(
  buffer: ArrayBuffer,
  options: XlsxParserOptions = {},
): Promise<XlsxParseResult> {
  const maxRows = options.maxRows ?? DEFAULT_MAX_ROWS
  const maxFieldLength = options.maxFieldLength ?? DEFAULT_MAX_FIELD_LENGTH

  const bytes = new Uint8Array(buffer)
  const view = new DataView(buffer)
  const entries = readZipDirectory(bytes, view)

  const workbookEntry = entries.get('xl/workbook.xml')
  if (!workbookEntry) throw new XlsxFormatError('הקובץ אינו קובץ xlsx תקין (אין workbook)')
  const workbookXml = await readEntryText(bytes, view, workbookEntry)

  const relsEntry = entries.get('xl/_rels/workbook.xml.rels')
  const relsXml = relsEntry ? await readEntryText(bytes, view, relsEntry) : null

  const sheetEntry = entries.get(firstSheetPath(workbookXml, relsXml))
  if (!sheetEntry) throw new XlsxFormatError('קובץ xlsx בלי אף גיליון')
  const sheetXml = await readEntryText(bytes, view, sheetEntry)

  const sharedEntry = entries.get('xl/sharedStrings.xml')
  const shared = parseSharedStrings(
    sharedEntry ? await readEntryText(bytes, view, sharedEntry) : null,
  )

  const rows: string[][] = []
  const errors: XlsxParseError[] = []
  let truncated = false

  // Self-closing `<row/>` first: tried second, its trailing slash would parse
  // as part of the attribute list and the lazy body would swallow the row after.
  for (const rowMatch of sheetXml.matchAll(/<row(\s[^>]*)?\/>|<row(\s[^>]*)?>([\s\S]*?)<\/row>/g)) {
    const rowAttrs = rowMatch[1] ?? rowMatch[2] ?? ''
    const inner = rowMatch[3] ?? ''
    const declared = Number.parseInt(attrOf(`<row${rowAttrs}>`, 'r') ?? '', 10)
    const rowNumber = Number.isFinite(declared) && declared > 0 ? declared : rows.length + 1
    if (rowNumber > maxRows) {
      truncated = true
      errors.push({ line: maxRows, message: `הקובץ נחתך אחרי ${maxRows} שורות` })
      break
    }
    while (rows.length < rowNumber) rows.push([])
    const cells = rows[rowNumber - 1] as string[]

    let nextCol = 0
    for (const cellMatch of inner.matchAll(/<c(\s[^>]*)?\/>|<c(\s[^>]*)?>([\s\S]*?)<\/c>/g)) {
      const cellTag = `<c${cellMatch[1] ?? cellMatch[2] ?? ''}>`
      const body = cellMatch[3] ?? ''
      const ref = attrOf(cellTag, 'r')
      const letters = ref?.match(/^([A-Z]+)\d+$/)?.[1]
      const col = letters ? columnIndex(letters) : nextCol
      nextCol = col + 1

      const type = attrOf(cellTag, 't') ?? 'n'
      let value = ''
      if (type === 's') {
        const idx = Number.parseInt(body.match(/<v(?:\s[^>]*)?>([\s\S]*?)<\/v>/)?.[1] ?? '', 10)
        value = shared[idx] ?? ''
      } else if (type === 'inlineStr') {
        value = textRuns(body)
      } else if (type === 'b') {
        value = body.includes('<v>1</v>') ? 'TRUE' : 'FALSE'
      } else {
        // n, str (formula result), e, d: the cached `<v>` text as written.
        value = decodeXml(body.match(/<v(?:\s[^>]*)?>([\s\S]*?)<\/v>/)?.[1] ?? '')
      }

      if (value.length > maxFieldLength) {
        value = value.slice(0, maxFieldLength)
        errors.push({ line: rowNumber, message: `שדה ארוך מ-${maxFieldLength} תווים נחתך` })
      }
      if (value.length > 0) {
        while (cells.length < col) cells.push('')
        cells[col] = value
      }
    }
  }

  return { rows, errors, truncated }
}
