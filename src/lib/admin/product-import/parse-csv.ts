/**
 * Incremental RFC 4180 CSV parser for the product import screen.
 *
 * Written by hand rather than pulled from a package because the import reads
 * the browser's `File.stream()` chunk by chunk: a chunk boundary can fall in
 * the middle of a quoted field, an escaped quote (`""`), or a CRLF pair, and
 * the parser must carry that state across `write()` calls instead of assuming
 * it sees whole lines. Pure and DOM-free so the same code is unit-testable in
 * vitest and reusable on the server if the entry point ever moves there.
 *
 * Lenient where Excel is lenient: a stray quote inside an unquoted field is
 * taken literally, and text after a closing quote is appended rather than
 * rejected, because "reject the file" helps nobody when the goal is telling
 * the admin which ROW is wrong.
 */

export interface CsvParseError {
  /** 1-based line of the offending row (as counted by emitted rows). */
  line: number
  message: string
}

export interface CsvParseResult {
  /** Every parsed row, including the header row. */
  rows: string[][]
  errors: CsvParseError[]
  /** True when parsing stopped early because maxRows was hit. */
  truncated: boolean
}

export interface CsvParserOptions {
  /** Hard cap on emitted rows, header included. Guards memory on a wrong file. */
  maxRows?: number
  /** Hard cap on a single field's length. Guards a file with no delimiters. */
  maxFieldLength?: number
}

const DEFAULT_MAX_ROWS = 5001 // header + 5000 data rows
const DEFAULT_MAX_FIELD_LENGTH = 10_000

type State = 'field-start' | 'in-field' | 'in-quotes' | 'after-quote'

export class CsvStreamParser {
  private field = ''
  private row: string[] = []
  private state: State = 'field-start'
  private rowStarted = false
  private skipNextLf = false
  private first = true
  private fieldOverflow = false

  private readonly rows: string[][] = []
  private readonly errors: CsvParseError[] = []
  private truncated = false

  private readonly maxRows: number
  private readonly maxFieldLength: number

  constructor(options: CsvParserOptions = {}) {
    this.maxRows = options.maxRows ?? DEFAULT_MAX_ROWS
    this.maxFieldLength = options.maxFieldLength ?? DEFAULT_MAX_FIELD_LENGTH
  }

  write(chunk: string): void {
    if (this.truncated) return
    let text = chunk
    if (this.first) {
      // Excel's "CSV UTF-8" export starts with a BOM; it is not data.
      if (text.startsWith('﻿')) text = text.slice(1)
      this.first = false
    }
    for (const ch of text) {
      if (this.truncated) return
      this.consume(ch)
    }
  }

  /** Flush the trailing row (files rarely end with a newline) and finish. */
  end(): CsvParseResult {
    if (this.state === 'in-quotes' && !this.truncated) {
      this.errors.push({
        line: this.rows.length + 1,
        message: 'מרכאות שנפתחו ולא נסגרו עד סוף הקובץ',
      })
    }
    if (this.rowStarted || this.state === 'in-field' || this.field.length > 0) {
      this.endRow()
    }
    return { rows: this.rows, errors: this.errors, truncated: this.truncated }
  }

  private consume(ch: string): void {
    if (this.skipNextLf) {
      this.skipNextLf = false
      if (ch === '\n') return
    }

    if (this.state === 'in-quotes') {
      if (ch === '"') {
        this.state = 'after-quote'
      } else {
        this.appendToField(ch)
      }
      return
    }

    if (this.state === 'after-quote' && ch === '"') {
      // An escaped quote: `""` inside a quoted field.
      this.appendToField('"')
      this.state = 'in-quotes'
      return
    }

    // after-quote falls through to the shared delimiter handling below; any
    // non-delimiter character after a closing quote is appended leniently.
    if (ch === ',') {
      this.endField()
      return
    }
    if (ch === '\n' || ch === '\r') {
      if (ch === '\r') this.skipNextLf = true
      this.endRow()
      return
    }
    if (this.state === 'field-start' && ch === '"') {
      this.state = 'in-quotes'
      this.rowStarted = true
      return
    }
    this.appendToField(ch)
    this.state = 'in-field'
  }

  private appendToField(ch: string): void {
    this.rowStarted = true
    if (this.field.length >= this.maxFieldLength) {
      if (!this.fieldOverflow) {
        this.fieldOverflow = true
        this.errors.push({
          line: this.rows.length + 1,
          message: `שדה ארוך מ-${this.maxFieldLength} תווים נחתך`,
        })
      }
      return
    }
    this.field += ch
    if (this.state === 'field-start') this.state = 'in-field'
  }

  private endField(): void {
    this.row.push(this.field)
    this.field = ''
    this.fieldOverflow = false
    this.state = 'field-start'
    this.rowStarted = true
  }

  private endRow(): void {
    if (!this.rowStarted && this.field.length === 0 && this.row.length === 0) {
      // A blank line between rows: skip silently, Excel emits them freely.
      this.state = 'field-start'
      return
    }
    this.row.push(this.field)
    this.field = ''
    this.fieldOverflow = false
    this.rows.push(this.row)
    this.row = []
    this.state = 'field-start'
    this.rowStarted = false
    if (this.rows.length >= this.maxRows) {
      this.truncated = true
      this.errors.push({
        line: this.rows.length,
        message: `הקובץ נחתך אחרי ${this.maxRows} שורות`,
      })
    }
  }
}

/** One-shot convenience for tests and non-streaming callers. */
export function parseCsv(text: string, options?: CsvParserOptions): CsvParseResult {
  const parser = new CsvStreamParser(options)
  parser.write(text)
  return parser.end()
}
