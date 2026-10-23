import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { mapCsvToForms, parseCsv } from './product-csv'

describe('public/templates/products-import.csv', () => {
  const csv = parseCsv(
    readFileSync(resolve(process.cwd(), 'public/templates/products-import.csv'), 'utf8'),
  )

  it('uses only columns the importer knows, so nothing is silently dropped', () => {
    const mapped = mapCsvToForms(csv)
    expect(mapped.ok).toBe(true)
    if (mapped.ok) expect(mapped.unknownColumns).toEqual([])
  })

  it('has every example row pass validation', () => {
    const mapped = mapCsvToForms(csv)
    if (!mapped.ok) throw new Error(mapped.error)
    const failures = mapped.rows.filter((r) => !r.ok)
    expect(failures).toEqual([])
  })

  it('contains at least one coupon and one physical product example', () => {
    const mapped = mapCsvToForms(csv)
    if (!mapped.ok) throw new Error(mapped.error)

    const types = mapped.rows.map((r) => (r.ok ? r.form.get('type') : null))
    expect(types).toContain('coupon')
    expect(types).toContain('physical')
  })

  it('maps the lat/lng aliases onto the stored columns', () => {
    const mapped = mapCsvToForms(csv)
    if (!mapped.ok) throw new Error(mapped.error)

    // First row uses 'lat' and 'lng' headers which should map to latitude/longitude
    const first = mapped.rows[0]
    if (!first?.ok) throw new Error('first row invalid')

    expect(first.form.get('latitude')).toBe('32.0636')
    expect(first.form.get('longitude')).toBe('34.7731')
    expect(first.form.has('lat')).toBe(false)
    expect(first.form.has('lng')).toBe(false)
  })

  it('sets all products as drafts by default', () => {
    const mapped = mapCsvToForms(csv)
    if (!mapped.ok) throw new Error(mapped.error)

    for (const row of mapped.rows) {
      if (row.ok) {
        expect(row.form.get('status')).toBe('draft')
      }
    }
  })
})
