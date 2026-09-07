import { describe, expect, it } from 'vitest'
import { CsvStreamParser, parseCsv } from './parse-csv'

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
