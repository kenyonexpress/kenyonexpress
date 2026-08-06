import { describe, expect, it } from 'vitest'
import { newestTimestamp } from './lastmod'

describe('newestTimestamp', () => {
  it('picks the latest, whatever the input order', () => {
    const values = ['2026-01-01T00:00:00Z', '2026-08-06T09:00:00Z', '2026-03-01T00:00:00Z']
    expect(newestTimestamp(values)?.toISOString()).toBe('2026-08-06T09:00:00.000Z')
    expect(newestTimestamp([...values].reverse())?.toISOString()).toBe('2026-08-06T09:00:00.000Z')
  })

  it('accepts Dates alongside strings', () => {
    expect(
      newestTimestamp(['2026-01-01T00:00:00Z', new Date('2026-08-06T09:00:00Z')])?.toISOString(),
    ).toBe('2026-08-06T09:00:00.000Z')
  })

  it('is undefined for nothing, rather than now', () => {
    // The whole point. An empty catalogue with a lastmod of now claims four
    // pages changed this second, which is the failure being removed and not
    // relocated. Google ignores an inaccurate lastmod for the whole file.
    expect(newestTimestamp([])).toBeUndefined()
    expect(newestTimestamp([null, undefined])).toBeUndefined()
  })

  it('skips values it cannot parse instead of returning Invalid Date', () => {
    expect(newestTimestamp(['not a date'])).toBeUndefined()
    expect(newestTimestamp(['not a date', '2026-08-06T09:00:00Z'])?.toISOString()).toBe(
      '2026-08-06T09:00:00.000Z',
    )
  })

  it('treats an empty string as absence', () => {
    expect(newestTimestamp([''])).toBeUndefined()
  })
})
