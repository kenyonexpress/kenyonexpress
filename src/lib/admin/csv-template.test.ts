import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { mapCsvToForms, parseCsv } from './product-csv'

describe('docs/CSV-TEMPLATE.csv', () => {
  const csv = parseCsv(readFileSync(resolve(process.cwd(), 'docs/CSV-TEMPLATE.csv'), 'utf8'))

  it('uses only columns the importer knows, so nothing is silently dropped', () => {
    const mapped = mapCsvToForms(csv)
    expect(mapped.ok).toBe(true)
    if (mapped.ok) expect(mapped.unknownColumns).toEqual([])
  })

  it('has every example row pass validation', () => {
    const mapped = mapCsvToForms(csv)
    if (!mapped.ok) throw new Error(mapped.error)
    expect(mapped.rows.filter((r) => !r.ok)).toEqual([])
  })

  it('maps the aliases onto the stored columns', () => {
    const mapped = mapCsvToForms(csv)
    if (!mapped.ok) throw new Error(mapped.error)
    const first = mapped.rows[0]
    if (!first?.ok) throw new Error('first row invalid')
    expect(first.form.get('latitude')).toBe('32.0636')
    expect(first.form.get('payout_cadence')).toBe('biweekly')
    expect(first.form.has('lat')).toBe(false)
  })

  it('rejects a bad row at parse time, before anything is written', () => {
    const bad = parseCsv(
      'slug,name_he,type,kenyon_price,shipping_price_agorot,lat\nx,איקס,physical,10,29.90,32\n',
    )
    const mapped = mapCsvToForms(bad)
    if (!mapped.ok) throw new Error(mapped.error)
    expect(mapped.rows[0]?.ok).toBe(false)
  })
})
