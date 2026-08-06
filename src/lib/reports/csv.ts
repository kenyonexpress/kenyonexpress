/**
 * CSV for the admin exports, with the two details that decide whether a Hebrew
 * report opens correctly in the program every one of these will be opened in.
 *
 * 1. THE BOM. Excel on Windows does not detect UTF-8; it reads a CSV in the
 *    system code page unless the file starts with a byte-order mark. Without it
 *    every Hebrew heading in every export arrives as mojibake, and the report
 *    looks corrupt rather than mis-decoded. Three bytes, EF BB BF, and it is the
 *    difference between a usable export and a support ticket.
 *
 * 2. CRLF line endings, which is what RFC 4180 specifies and what the same Excel
 *    expects. A lone LF is read as one enormous row by some versions.
 *
 * Quoting follows RFC 4180 rather than "escape if it looks dangerous": a field
 * is quoted when it contains a comma, a quote, a newline or leading/trailing
 * whitespace, and an embedded quote is doubled. A field that begins with `=`,
 * `+`, `-` or `@` is prefixed with a tab, because spreadsheets treat those as
 * FORMULAS — a supplier named `=cmd|...` is the classic CSV injection, and this
 * export is opened by an administrator on their own machine.
 */

const BOM = '﻿'
const CRLF = '\r\n'
const FORMULA_LEAD = /^[=+\-@\t\r]/

export interface CsvColumn<Row> {
  /** Header text, Hebrew. */
  header: string
  value: (row: Row) => string | number | null | undefined
}

function cell(raw: string | number | null | undefined): string {
  if (raw === null || raw === undefined) return ''
  let text = String(raw)

  // Formula guard first: the tab it prepends is itself a reason to quote.
  if (FORMULA_LEAD.test(text)) text = `\t${text}`

  const needsQuotes = /[",\r\n]/.test(text) || text !== text.trim()
  if (!needsQuotes) return text
  return `"${text.replace(/"/g, '""')}"`
}

export function toCsv<Row>(rows: readonly Row[], columns: readonly CsvColumn<Row>[]): string {
  const header = columns.map((c) => cell(c.header)).join(',')
  const body = rows.map((row) => columns.map((c) => cell(c.value(row))).join(','))
  return BOM + [header, ...body].join(CRLF) + CRLF
}

/**
 * `Content-Disposition` with both the plain and the RFC 5987 form.
 *
 * The plain `filename=` cannot carry Hebrew, and a browser given only the
 * encoded form by an older UA saves the file as the URL's last segment. Both are
 * sent, which is what the RFC prescribes and what every browser handles.
 */
export function csvHeaders(filename: string): Record<string, string> {
  const ascii = filename.replace(/[^\w.\-]+/g, '_')
  return {
    'content-type': 'text/csv; charset=utf-8',
    'content-disposition': `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    // A report is a snapshot of live money. Caching one is showing an admin
    // yesterday's numbers with today's date on them.
    'cache-control': 'private, no-store',
  }
}
