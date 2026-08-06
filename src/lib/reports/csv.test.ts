import { describe, expect, it } from 'vitest'
import { type CsvColumn, csvHeaders, toCsv } from './csv'

type Row = { name: string; amount: number | null }
const COLUMNS: CsvColumn<Row>[] = [
  { header: 'ספק', value: (r) => r.name },
  { header: 'סכום', value: (r) => r.amount },
]

function rows(...values: Row[]): string {
  return toCsv(values, COLUMNS)
}

describe('the two details that decide whether Excel can open the file', () => {
  it('starts with a UTF-8 BOM', () => {
    // Excel on Windows does not detect UTF-8. Without these three bytes every
    // Hebrew heading in every export arrives as mojibake, and the report looks
    // corrupt rather than mis-decoded.
    expect(rows({ name: 'מסעדה', amount: 1 }).codePointAt(0)).toBe(0xfeff)
  })

  it('separates rows with CRLF, which is what RFC 4180 says', () => {
    const csv = rows({ name: 'a', amount: 1 }, { name: 'b', amount: 2 })
    expect(csv).toContain('\r\n')
    expect(csv.replace(/\r\n/g, '')).not.toContain('\n')
  })
})

describe('quoting', () => {
  it('quotes a field containing a comma', () => {
    expect(rows({ name: 'הרצל 1, תל אביב', amount: 1 })).toContain('"הרצל 1, תל אביב"')
  })

  it('doubles an embedded quote rather than ending the field', () => {
    expect(rows({ name: 'קפה "שקד"', amount: 1 })).toContain('"קפה ""שקד"""')
  })

  it('quotes a field containing a newline', () => {
    expect(rows({ name: 'שורה\nשנייה', amount: 1 })).toContain('"שורה\nשנייה"')
  })

  it('quotes a field whose whitespace would otherwise be eaten', () => {
    expect(rows({ name: '  מרווח  ', amount: 1 })).toContain('"  מרווח  "')
  })

  it('leaves an ordinary field alone', () => {
    expect(rows({ name: 'מסעדה', amount: 42 })).toContain('מסעדה,42')
  })

  it('writes an empty cell for null, not the word null', () => {
    expect(rows({ name: 'x', amount: null }).trimEnd().endsWith('x,')).toBe(true)
  })

  it('writes a zero, which is a value and not an absence', () => {
    expect(rows({ name: 'x', amount: 0 })).toContain('x,0')
  })
})

describe('the formula guard', () => {
  it.each(['=1+1', '+1e', '-1+cmd|/c calc', '@SUM(A1)'])(
    'defuses a field starting with %s',
    (value) => {
      // A spreadsheet treats these as formulas. `=cmd|...` is the classic CSV
      // injection, and this export is opened by an administrator on their own
      // machine — the one reader with the most to lose.
      const csv = rows({ name: value, amount: 1 })
      expect(csv).toContain(`"\t${value}"`)
    },
  )

  it('leaves a Hebrew name that merely contains a minus alone', () => {
    expect(rows({ name: 'קפה-שקד', amount: 1 })).toContain('קפה-שקד')
  })

  it('does NOT defuse a negative number, which is not a formula', () => {
    // An open obligation that went negative is a supplier who owes the platform
    // money — the one case supplierObligations refuses to clamp, because it is
    // the one an admin opens the report to find. Guarding it would make Excel
    // store it as text: it would not sum, would not sort against the positives,
    // and would sit at the wrong end of the column.
    const csv = rows({ name: 'x', amount: -1250.5 })
    expect(csv).toContain('x,-1250.5')
    expect(csv).not.toContain('\t-1250.5')
  })

  it.each([-1, -0.5, 1, 0])('leaves the plain number %s alone', (value) => {
    expect(rows({ name: 'x', amount: value })).toContain(`x,${value}`)
  })
})

describe('csvHeaders', () => {
  it('sends both the plain and the encoded filename', () => {
    // The plain form cannot carry Hebrew; an older UA given only the encoded
    // form saves the file as the URL's last segment.
    const headers = csvHeaders('דוח-מכירות.csv')
    expect(headers['content-disposition']).toContain('filename="')
    expect(headers['content-disposition']).toContain(
      `filename*=UTF-8''${encodeURIComponent('דוח-מכירות.csv')}`,
    )
  })

  it('never caches a report', () => {
    // A report is a snapshot of live money. A cached one shows an admin
    // yesterday's numbers with today's date on them.
    expect(csvHeaders('x.csv')['cache-control']).toBe('private, no-store')
  })

  it('declares utf-8', () => {
    expect(csvHeaders('x.csv')['content-type']).toBe('text/csv; charset=utf-8')
  })
})
