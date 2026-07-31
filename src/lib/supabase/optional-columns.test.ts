import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  CASHBACK_PERCENT_CANDIDATES,
  COUPON_054_COLUMNS,
  type Coupon054Row,
  __resetColumnCandidateCache,
  readFirstAvailableColumn,
  readOptionalColumns,
  readStickerPriceIls,
  readWalletAccountAgorot,
} from './optional-columns'

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

describe('readStickerPriceIls', () => {
  const undefinedColumn = (col: string) => ({
    code: '42703',
    message: `column products.${col} does not exist`,
  })

  it('reads price_ils when this database still has it (the hosted project)', async () => {
    const run = vi.fn(async (select: string) => {
      if (select.includes('price_agorot'))
        return { data: null, error: undefinedColumn('price_agorot') }
      return { data: [{ id: 'p1', price_ils: 180 }], error: null }
    })
    expect(await readStickerPriceIls(run as never, 'p1', 'test')).toBe(180)
  })

  it('falls back to price_agorot and converts to shekels when 059 has been applied', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const run = vi.fn(async (select: string) => {
      if (select.includes('price_ils')) return { data: null, error: undefinedColumn('price_ils') }
      return { data: [{ id: 'p1', price_agorot: 18_000 }], error: null }
    })
    expect(await readStickerPriceIls(run as never, 'p1', 'test')).toBe(180)
    warn.mockRestore()
  })

  it('returns null when neither column exists, instead of inventing a price', async () => {
    // The caller then falls back to its own pre-059 column. Returning 0 here
    // would quote a free product.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const run = vi.fn(async (select: string) => ({
      data: null,
      error: undefinedColumn(select.includes('price_ils') ? 'price_ils' : 'price_agorot'),
    }))
    expect(await readStickerPriceIls(run as never, 'p1', 'test')).toBeNull()
    warn.mockRestore()
  })

  it('skips a column that exists but is null on this row', async () => {
    const run = vi.fn(async (select: string) => {
      if (select.includes('price_ils'))
        return { data: [{ id: 'p1', price_ils: null }], error: null }
      return { data: [{ id: 'p1', price_agorot: 9900 }], error: null }
    })
    expect(await readStickerPriceIls(run as never, 'p1', 'test')).toBe(99)
  })

  it('never names both spellings in one select', async () => {
    // Naming a column this database lacks fails the WHOLE query with 42703.
    // That is what made every product page 404, twice, in both directions.
    const selects: string[] = []
    const run = vi.fn(async (select: string) => {
      selects.push(select)
      return { data: [{ id: 'p1', price_ils: 10 }], error: null }
    })
    await readStickerPriceIls(run as never, 'p1', 'test')
    for (const s of selects) {
      expect(s.includes('price_ils') && s.includes('price_agorot')).toBe(false)
    }
  })
})

describe('readFirstAvailableColumn', () => {
  beforeEach(() => {
    __resetColumnCandidateCache()
  })

  const undefinedColumnError = { code: '42703', message: 'column does not exist' }

  it('reads the first candidate when this database has it', async () => {
    const run = vi.fn(async () => ({
      data: [{ id: 'p1', cashback_bp: 250 }],
      error: null,
    }))
    const map = await readFirstAvailableColumn<number>(
      run as never,
      CASHBACK_PERCENT_CANDIDATES,
      ['p1'],
      'test',
    )
    // 250 basis points is 2.5 percent.
    expect(map.get('p1')).toBe(2.5)
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('falls through to the pre-059 spelling and converts it differently', async () => {
    const run = vi.fn(async (select: string) => {
      if (select.includes('cashback_bp')) return { data: null, error: undefinedColumnError }
      return { data: [{ id: 'p1', cashback_percent: 2.5 }], error: null }
    })
    const map = await readFirstAvailableColumn<number>(
      run as never,
      CASHBACK_PERCENT_CANDIDATES,
      ['p1'],
      'test',
    )
    expect(map.get('p1')).toBe(2.5)
  })

  // Naming both spellings in one select is the failure this whole helper exists
  // to avoid: 42703 fails the WHOLE query, not just the column.
  it('never names two candidates in one select', async () => {
    const selects: string[] = []
    const run = vi.fn(async (select: string) => {
      selects.push(select)
      if (select.includes('cashback_bp')) return { data: null, error: undefinedColumnError }
      return { data: [{ id: 'p1', cashback_percent: 1 }], error: null }
    })
    await readFirstAvailableColumn<number>(
      run as never,
      CASHBACK_PERCENT_CANDIDATES,
      ['p1'],
      'test',
    )
    for (const s of selects) {
      expect(s.includes('cashback_bp') && s.includes('cashback_percent')).toBe(false)
    }
  })

  it('remembers the winner so the steady state is one query', async () => {
    const run = vi.fn(async (select: string) => {
      if (select.includes('cashback_bp')) return { data: null, error: undefinedColumnError }
      return { data: [{ id: 'p1', cashback_percent: 3 }], error: null }
    })
    await readFirstAvailableColumn<number>(
      run as never,
      CASHBACK_PERCENT_CANDIDATES,
      ['p1'],
      'test',
    )
    const firstRoundCalls = run.mock.calls.length
    await readFirstAvailableColumn<number>(
      run as never,
      CASHBACK_PERCENT_CANDIDATES,
      ['p1'],
      'test',
    )
    expect(run.mock.calls.length - firstRoundCalls).toBe(1)
  })

  it('reads an absent value as null rather than zero', async () => {
    const run = vi.fn(async () => ({ data: [{ id: 'p1', cashback_bp: null }], error: null }))
    const map = await readFirstAvailableColumn<number>(
      run as never,
      CASHBACK_PERCENT_CANDIDATES,
      ['p1'],
      'test',
    )
    expect(map.get('p1')).toBeNull()
  })

  it('returns an empty map, and warns, when no candidate exists', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const run = vi.fn(async () => ({ data: null, error: undefinedColumnError }))
    const map = await readFirstAvailableColumn<number>(
      run as never,
      CASHBACK_PERCENT_CANDIDATES,
      ['p1'],
      'test-missing',
    )
    expect(map.size).toBe(0)
    expect(warn).toHaveBeenCalled()
  })

  it('rethrows an error that is not a missing column', async () => {
    const run = vi.fn(async () => ({ data: null, error: { code: '57P01', message: 'shutdown' } }))
    await expect(
      readFirstAvailableColumn<number>(run as never, CASHBACK_PERCENT_CANDIDATES, ['p1'], 'test'),
    ).rejects.toThrow('shutdown')
  })

  it('does no query at all for an empty id list', async () => {
    const run = vi.fn()
    expect(
      (
        await readFirstAvailableColumn<number>(
          run as never,
          CASHBACK_PERCENT_CANDIDATES,
          [],
          'test',
        )
      ).size,
    ).toBe(0)
    expect(run).not.toHaveBeenCalled()
  })
})

/**
 * The wallet balance, which four call sites used to name by guess and guessed
 * two different ways. Verified against the live database on 2026-07-31:
 * `balance_agorot` does not exist there, so the two readers that named it
 * returned nothing and reported an empty wallet to every customer.
 */
describe('readWalletAccountAgorot', () => {
  beforeEach(() => {
    __resetColumnCandidateCache()
  })

  const undefinedColumn = { code: '42703', message: 'column does not exist' }

  it('reads a post-059 database in agorot, unconverted', async () => {
    const run = vi.fn(async () => ({
      data: [{ id: 'acct-1', balance_agorot: 12345 }],
      error: null,
    }))
    expect(await readWalletAccountAgorot(run as never, 'user-1')).toEqual({
      accountId: 'acct-1',
      balanceAgorot: 12345,
    })
  })

  // The production shape. ₪123.45 is 12345 agorot, and a caller must never get
  // the shekel figure back believing it is agorot.
  it('converts the hosted project shekel column to agorot', async () => {
    const run = vi.fn(async (select: string) => {
      if (select.includes('balance_agorot')) return { data: null, error: undefinedColumn }
      return { data: [{ id: 'acct-1', balance_ils: 123.45 }], error: null }
    })
    expect(await readWalletAccountAgorot(run as never, 'user-1')).toEqual({
      accountId: 'acct-1',
      balanceAgorot: 12345,
    })
  })

  it('rounds a stored shekel fraction rather than carrying a float into money', async () => {
    const run = vi.fn(async (select: string) => {
      if (select.includes('balance_agorot')) return { data: null, error: undefinedColumn }
      return { data: [{ id: 'acct-1', balance_ils: 0.1 + 0.2 }], error: null }
    })
    expect((await readWalletAccountAgorot(run as never, 'user-1')).balanceAgorot).toBe(30)
  })

  it('reads a customer with no wallet row as an empty wallet, not as an error', async () => {
    const run = vi.fn(async () => ({ data: [], error: null }))
    expect(await readWalletAccountAgorot(run as never, 'user-1')).toEqual({
      accountId: null,
      balanceAgorot: 0,
    })
  })

  // Both spellings in one select is the failure the helper exists to avoid: a
  // 42703 takes down the whole query, so naming more columns makes it likelier.
  it('never names both spellings in one select', async () => {
    const selects: string[] = []
    const run = vi.fn(async (select: string) => {
      selects.push(select)
      if (select.includes('balance_agorot')) return { data: null, error: undefinedColumn }
      return { data: [{ id: 'acct-1', balance_ils: 1 }], error: null }
    })
    await readWalletAccountAgorot(run as never, 'user-1')
    expect(selects.length).toBeGreaterThan(1)
    for (const s of selects) {
      expect(s.includes('balance_agorot') && s.includes('balance_ils')).toBe(false)
    }
  })

  it('passes the user id through as the filter argument, not as a row id', async () => {
    const run = vi.fn(async (_select: string, ids: string[]) => {
      expect(ids).toEqual(['user-1'])
      return { data: [{ id: 'acct-1', balance_agorot: 500 }], error: null }
    })
    await readWalletAccountAgorot(run as never, 'user-1')
    expect(run).toHaveBeenCalled()
  })
})
