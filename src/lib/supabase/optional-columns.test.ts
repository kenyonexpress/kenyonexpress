import { afterEach, describe, expect, it, vi } from 'vitest'
import { COUPON_054_COLUMNS, type Coupon054Row, readOptionalColumns } from './optional-columns'

const UNDEFINED_COLUMN = {
  code: '42703',
  message: 'column products.coupon_price_ils does not exist',
}

afterEach(() => vi.restoreAllMocks())

describe('readOptionalColumns', () => {
  it('returns the rows keyed by id when the columns exist', async () => {
    const rows: Coupon054Row[] = [
      { id: 'a', coupon_price_ils: 50, offer_valid_until: null },
      { id: 'b', coupon_price_ils: null, offer_valid_until: '2026-12-31T00:00:00Z' },
    ]
    const result = await readOptionalColumns<Coupon054Row>(
      async () => ({ data: rows, error: null }),
      COUPON_054_COLUMNS,
      ['a', 'b'],
      'test',
    )
    expect(result.get('a')?.coupon_price_ils).toBe(50)
    expect(result.get('b')?.offer_valid_until).toBe('2026-12-31T00:00:00Z')
  })

  it('asks for the id alongside the requested columns', async () => {
    // Without the id the caller cannot key the result, and the whole point is
    // to merge these back onto rows fetched by the main query.
    const run = vi.fn(async () => ({ data: [], error: null }))
    await readOptionalColumns<Coupon054Row>(run, COUPON_054_COLUMNS, ['a'], 'test')
    expect(run).toHaveBeenCalledWith('id, coupon_price_ils, offer_valid_until', ['a'])
  })

  it('degrades to an empty map when the column does not exist in this database', async () => {
    // This is the case that matters: migration 054 is not applied to the hosted
    // project, and naming the column in the main select failed the entire cart
    // query with 42703 — an empty cart rather than an unpriced coupon line.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const result = await readOptionalColumns<Coupon054Row>(
      async () => ({ data: null, error: UNDEFINED_COLUMN }),
      COUPON_054_COLUMNS,
      ['a'],
      'cart',
    )
    expect(result.size).toBe(0)
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('054_voucher_redemption.sql'))
  })

  it('warns once per label, not once per request', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const run = async () => ({ data: null, error: UNDEFINED_COLUMN })
    for (let i = 0; i < 3; i++) {
      await readOptionalColumns<Coupon054Row>(run, COUPON_054_COLUMNS, ['a'], 'repeat-label')
    }
    expect(warn.mock.calls.filter((c) => String(c[0]).includes('repeat-label'))).toHaveLength(1)
  })

  it('rethrows any error that is not an undefined column', async () => {
    // Narrow on purpose: this must not become a general "ignore schema errors"
    // helper that hides a permissions or connection failure.
    await expect(
      readOptionalColumns<Coupon054Row>(
        async () => ({ data: null, error: { code: '42501', message: 'permission denied' } }),
        COUPON_054_COLUMNS,
        ['a'],
        'test',
      ),
    ).rejects.toThrow('permission denied')
  })

  it('skips the query entirely for an empty id list', async () => {
    const run = vi.fn(async () => ({ data: [], error: null }))
    const result = await readOptionalColumns<Coupon054Row>(run, COUPON_054_COLUMNS, [], 'test')
    expect(result.size).toBe(0)
    expect(run).not.toHaveBeenCalled()
  })
})
