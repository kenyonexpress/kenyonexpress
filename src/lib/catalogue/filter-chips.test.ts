import { describe, expect, it } from 'vitest'
import {
  OPEN_WEEKEND_TAG,
  applyChipFilters,
  chipFiltersFromParams,
  chipLinkParams,
  hasActiveChip,
  isMissingShippingColumn,
  parseOpen,
  parseShipping,
  toggleChipHref,
} from './filter-chips'

describe('chip parsers', () => {
  it('accept exactly their one value and widen everything else to no filter', () => {
    expect(parseOpen('weekend')).toBe('weekend')
    expect(parseShipping('free')).toBe('free')
    for (const raw of ['', 'WEEKEND', 'sunday', undefined, ['sunday'], 'free; drop table']) {
      expect(parseOpen(raw as string | string[] | undefined)).toBeUndefined()
    }
    for (const raw of ['', 'FREE', 'paid', undefined, 'free,x']) {
      expect(parseShipping(raw as string | string[] | undefined)).toBeUndefined()
    }
    // An array takes its first value, like every other parser on the page.
    expect(parseOpen(['weekend', 'x'])).toBe('weekend')
  })

  it('reads both chips off the page query and writes them back as link params', () => {
    const filters = chipFiltersFromParams({ open: 'weekend', shipping: 'free', sort: 'name' })
    expect(filters).toEqual({ openWeekend: true, freeShipping: true })
    expect(chipLinkParams(filters)).toEqual({ open: 'weekend', shipping: 'free' })
    expect(chipFiltersFromParams({})).toEqual({ openWeekend: undefined, freeShipping: undefined })
    expect(chipLinkParams({})).toEqual({ open: undefined, shipping: undefined })
    expect(hasActiveChip({})).toBe(false)
    expect(hasActiveChip({ freeShipping: true })).toBe(true)
  })
})

describe('toggleChipHref', () => {
  const params = { sort: 'name', page: '3', open: undefined, near: '32.08,34.78' }

  it('turns a chip on, keeps the other filters, and drops the page', () => {
    const href = toggleChipHref('/category/spa', params, 'open', 'weekend')
    const url = new URL(href, 'https://x.test')
    expect(url.pathname).toBe('/category/spa')
    expect(url.searchParams.get('open')).toBe('weekend')
    expect(url.searchParams.get('sort')).toBe('name')
    expect(url.searchParams.get('near')).toBe('32.08,34.78')
    expect(url.searchParams.has('page')).toBe(false)
  })

  it('turns an active chip off', () => {
    const href = toggleChipHref(
      '/products',
      { open: 'weekend', shipping: 'free' },
      'open',
      'weekend',
    )
    expect(href).toBe('/products?shipping=free')
  })

  it('is the bare path when nothing is left', () => {
    expect(toggleChipHref('/products', { open: 'weekend' }, 'open', 'weekend')).toBe('/products')
  })
})

describe('applyChipFilters', () => {
  const fake = () => {
    const calls: unknown[][] = []
    const q = {
      contains(column: string, value: string[]) {
        calls.push(['contains', column, value])
        return q
      },
      eq(column: string, value: boolean | number) {
        calls.push(['eq', column, value])
        return q
      },
    }
    return { q, calls }
  }

  it('adds nothing when no chip is on', () => {
    const { q, calls } = fake()
    applyChipFilters(q, {}, true)
    expect(calls).toEqual([])
  })

  it('filters the weekend chip on the marker tag, a column production has', () => {
    const { q, calls } = fake()
    applyChipFilters(q, { openWeekend: true }, true)
    expect(calls).toEqual([['contains', 'tags', [OPEN_WEEKEND_TAG]]])
  })

  it('names shipping_price_agorot only when told the database has it', () => {
    const with243 = fake()
    applyChipFilters(with243.q, { freeShipping: true }, true)
    expect(with243.calls).toEqual([
      ['eq', 'requires_shipping', true],
      ['eq', 'shipping_price_agorot', 0],
    ])
    const without = fake()
    applyChipFilters(without.q, { freeShipping: true }, false)
    expect(without.calls).toEqual([['eq', 'requires_shipping', true]])
  })
})

describe('isMissingShippingColumn', () => {
  it('recognises only the undefined-column error for that column', () => {
    expect(
      isMissingShippingColumn({
        code: '42703',
        message: 'column products.shipping_price_agorot does not exist',
      }),
    ).toBe(true)
    // Another missing column is a different bug and must not be retried past.
    expect(isMissingShippingColumn({ code: '42703', message: 'column tags does not exist' })).toBe(
      false,
    )
    expect(isMissingShippingColumn({ code: 'PGRST301', message: 'shipping_price_agorot' })).toBe(
      false,
    )
    expect(isMissingShippingColumn(null)).toBe(false)
  })
})
