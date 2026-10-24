import { describe, expect, it } from 'vitest'
import { PRODUCT_CSV_MAX_ROWS, mapCsvToForms, parseCsv } from './product-csv'

describe('parseCsv', () => {
  it('handles quotes, doubled quotes, CRLF and a BOM', () => {
    const out = parseCsv('﻿a,b\r\n"x,1","he said ""hi"""\r\n')
    expect(out.header).toEqual(['a', 'b'])
    expect(out.rows).toEqual([['x,1', 'he said "hi"']])
  })
  it('keeps a newline inside a quoted field and skips blank lines', () => {
    const out = parseCsv('a\n"l1\nl2"\n\n')
    expect(out.rows).toEqual([['l1\nl2']])
  })
})

describe('mapCsvToForms', () => {
  const head = 'slug,name_he,type,kenyon_price,status\n'
  it('forces draft and keeps decimal price text', () => {
    const r = mapCsvToForms(parseCsv(`${head}s1,שם,coupon,19.90,active\n`))
    if (!r.ok) throw new Error(r.error)
    const row = r.rows[0]
    if (!row?.ok) throw new Error('row')
    expect(row.form.get('status')).toBe('draft')
    expect(row.form.get('kenyon_price')).toBe('19.90')
    expect(r.unknownColumns).toEqual(['status'])
  })
  it('rejects an unknown type and a non-numeric price in the dry run', () => {
    const r = mapCsvToForms(
      parseCsv(`${head}s1,שם,bogus,10,\ns2,שם,physical,abc,\ns3,שם,physical,80.50,\n`),
    )
    if (!r.ok) throw new Error(r.error)
    expect(r.rows[0]).toMatchObject({ ok: false, line: 2 })
    expect(r.rows[1]).toMatchObject({ ok: false, line: 3 })
    expect(r.rows[2]).toMatchObject({ ok: true, line: 4 })
  })
  it('refuses a file without a required column', () => {
    expect(mapCsvToForms(parseCsv('slug,name_he\na,b\n')).ok).toBe(false)
  })
  it('flags a row missing a required value with its line number', () => {
    const r = mapCsvToForms(parseCsv(`${head}s1,,coupon,10,\n`))
    if (!r.ok) throw new Error(r.error)
    expect(r.rows[0]).toMatchObject({ ok: false, line: 2 })
  })
  it('caps the batch', () => {
    const body = Array.from({ length: PRODUCT_CSV_MAX_ROWS + 1 }, (_, i) => `s${i},n,coupon,1,`)
    expect(mapCsvToForms(parseCsv(`${head}${body.join('\n')}`)).ok).toBe(false)
  })
})
