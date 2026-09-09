import { describe, expect, it } from 'vitest'
import { CsvStreamParser, detectDelimiter, parseCsv } from './parse-csv'

describe('parseCsv', () => {
  it('parses plain rows', () => {
    const { rows, errors } = parseCsv('a,b,c\n1,2,3\n')
    expect(errors).toEqual([])
    expect(rows).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', '3'],
    ])
  })

  it('handles CRLF, a missing trailing newline, and blank lines', () => {
    const { rows } = parseCsv('a,b\r\n\r\n1,2\r\n3,4')
    expect(rows).toEqual([
      ['a', 'b'],
      ['1', '2'],
      ['3', '4'],
    ])
  })

  it('strips a UTF-8 BOM from the first cell only', () => {
    const { rows } = parseCsv('﻿slug,name\nx,y')
    expect(rows[0]).toEqual(['slug', 'name'])
  })

  it('parses quoted fields with embedded commas, quotes and newlines', () => {
    const { rows, errors } = parseCsv('a,b\n"one, two","say ""hi""\nnext line"')
    expect(errors).toEqual([])
    expect(rows[1]).toEqual(['one, two', 'say "hi"\nnext line'])
  })

  it('keeps empty fields, including a trailing one', () => {
    const { rows } = parseCsv('a,,c\n,,\n')
    expect(rows).toEqual([
      ['a', '', 'c'],
      ['', '', ''],
    ])
  })

  it('takes a stray quote inside an unquoted field literally', () => {
    const { rows } = parseCsv('ma"kat,x')
    expect(rows).toEqual([['ma"kat', 'x']])
  })

  it('reports an unterminated quote instead of hanging', () => {
    const { rows, errors } = parseCsv('a,b\n"never closed')
    expect(errors.some((e) => e.message.includes('מרכאות'))).toBe(true)
    expect(rows[1]).toEqual(['never closed'])
  })

  it('survives chunk boundaries inside quotes, escapes and CRLF', () => {
    // Every split point of the same input must yield the same rows.
    const text = 'h1,h2\r\n"a""b",c\r\nעברית,"שתי\nשורות"'
    const expected = parseCsv(text).rows
    for (let split = 1; split < text.length; split++) {
      const parser = new CsvStreamParser()
      parser.write(text.slice(0, split))
      parser.write(text.slice(split))
      expect(parser.end().rows, `split at ${split}`).toEqual(expected)
    }
  })

  it('stops at maxRows and says so', () => {
    const { rows, errors, truncated } = parseCsv('a\n1\n2\n3\n4\n', { maxRows: 3 })
    expect(truncated).toBe(true)
    expect(rows).toHaveLength(3)
    expect(errors.some((e) => e.message.includes('נחתך'))).toBe(true)
  })

  it('truncates an over-long field once, with one error', () => {
    const { rows, errors } = parseCsv(`a,${'x'.repeat(30)}`, { maxFieldLength: 10 })
    expect(rows[0]?.[1]).toBe('x'.repeat(10))
    expect(errors).toHaveLength(1)
  })
})

describe('delimiter detection', () => {
  it('reads a semicolon-delimited export as columns, not as one field', () => {
    // The failure this exists for: Excel writes the list separator from the
    // OS locale, so on some machines "Save as CSV" produces semicolons and the
    // file looks identical in the spreadsheet. Parsed as commas, every line is
    // ONE field and the import reports missing columns for a file whose
    // columns are plainly there.
    const result = parseCsv('name;price;sku\nמוצר;99;A1\n')
    expect(result.rows[0]).toEqual(['name', 'price', 'sku'])
    expect(result.rows[1]).toEqual(['מוצר', '99', 'A1'])
  })

  it('still reads a comma-delimited file', () => {
    const result = parseCsv('name,price,sku\nמוצר,99,A1\n')
    expect(result.rows[0]).toEqual(['name', 'price', 'sku'])
  })

  it('reads a tab-delimited file, which is what a paste from a spreadsheet is', () => {
    const result = parseCsv('name\tprice\tsku\nמוצר\t99\tA1\n')
    expect(result.rows[0]).toEqual(['name', 'price', 'sku'])
  })

  it('is not fooled by a separator that appears INSIDE a quoted header', () => {
    // `"name, full"` has a comma that is data. Without respecting quotes it
    // would tie with the real semicolons and win on candidate order.
    const result = parseCsv('"name, full";price;sku\n"מוצר, מלא";99;A1\n')
    expect(result.rows[0]).toEqual(['name, full', 'price', 'sku'])
    expect(result.rows[1]).toEqual(['מוצר, מלא', '99', 'A1'])
  })

  it('looks at the header line only, so data cannot outvote the columns', () => {
    // One description containing several semicolons must not turn a
    // comma-delimited file into a semicolon-delimited one.
    const result = parseCsv('name,description\nמוצר,"a;b;c;d;e;f"\n')
    expect(result.rows[0]).toEqual(['name', 'description'])
    expect(result.rows[1]).toEqual(['מוצר', 'a;b;c;d;e;f'])
  })

  it('falls back to a comma when the header has no separator at all', () => {
    const result = parseCsv('name\nמוצר\n')
    expect(result.rows).toEqual([['name'], ['מוצר']])
  })

  it('honours an explicit delimiter over detection', () => {
    const result = parseCsv('a;b,c\n', { delimiter: ',' })
    expect(result.rows[0]).toEqual(['a;b', 'c'])
  })

  it('detects through the BOM, which Excel writes before the header', () => {
    const result = parseCsv('﻿name;price\nמוצר;99\n')
    expect(result.rows[0]).toEqual(['name', 'price'])
  })
})

describe('detectDelimiter', () => {
  it('prefers the candidate with the most header fields', () => {
    expect(detectDelimiter('a;b;c;d\n')).toBe(';')
    expect(detectDelimiter('a,b,c,d\n')).toBe(',')
    expect(detectDelimiter('a\tb\tc\td\n')).toBe('\t')
  })

  it('breaks a tie towards the comma', () => {
    expect(detectDelimiter('a,b;c\n')).toBe(',')
  })

  it('handles a file with no newline at all', () => {
    expect(detectDelimiter('a;b;c')).toBe(';')
  })
})
