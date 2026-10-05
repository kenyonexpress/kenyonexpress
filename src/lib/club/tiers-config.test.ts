import { beforeEach, describe, expect, it, vi } from 'vitest'

const warn = vi.fn()
vi.mock('@/lib/observability/log', () => ({
  log: { warn: (...a: unknown[]) => warn(...a), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}))

const { CLUB_TIERS } = await import('./tiers')
const { __resetClubTiersWarning, readClubTiers } = await import('./tiers-config')

type Result = { data: unknown; error: { code?: string; message?: string } | null }

function client(result: Result | (() => never)) {
  return {
    from: () => ({
      select: () =>
        typeof result === 'function'
          ? Promise.reject(new Error('socket hang up'))
          : Promise.resolve(result),
    }),
  }
}

beforeEach(() => {
  warn.mockReset()
  __resetClubTiersWarning()
})

describe('readClubTiers', () => {
  it('answers the table rows when they validate', async () => {
    const read = await readClubTiers(
      client({
        data: [
          { id: 'member', min_agorot: 0 },
          { id: 'silver', min_agorot: 50_000 },
          { id: 'gold', min_agorot: 120_000 },
          { id: 'platinum', min_agorot: 500_000 },
        ],
        error: null,
      }) as never,
    )
    expect(read.source).toBe('table')
    expect(read.tableMissing).toBe(false)
    expect(read.tiers.map((t) => t.minAgorot)).toEqual([0, 50_000, 120_000, 500_000])
    expect(warn).not.toHaveBeenCalled()
  })

  it('answers the compiled defaults on PGRST205, names 251, and warns once per process', async () => {
    const missing = client({ data: null, error: { code: 'PGRST205', message: 'not found' } })
    const first = await readClubTiers(missing as never)
    const second = await readClubTiers(missing as never)
    expect(first.source).toBe('defaults')
    expect(first.tableMissing).toBe(true)
    expect(first.tiers).toBe(CLUB_TIERS)
    expect(second.tiers).toBe(CLUB_TIERS)
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn).toHaveBeenCalledWith(
      'club.tiers_table_missing',
      expect.objectContaining({ detail: expect.stringContaining('251_club_tiers.sql') }),
    )
  })

  it('answers the defaults and warns every time on any other error', async () => {
    const failing = client({ data: null, error: { code: '57014', message: 'statement timeout' } })
    await readClubTiers(failing as never)
    const read = await readClubTiers(failing as never)
    expect(read.source).toBe('defaults')
    expect(read.tableMissing).toBe(false)
    expect(read.reason).toBe('statement timeout')
    expect(warn).toHaveBeenCalledTimes(2)
    expect(warn).toHaveBeenCalledWith('club.tiers_read_failed', { reason: 'statement timeout' })
  })

  it('answers the defaults with the rejection reason when the rows do not validate', async () => {
    const read = await readClubTiers(
      client({
        data: [
          { id: 'member', min_agorot: 0 },
          { id: 'silver', min_agorot: 300_000 },
          { id: 'gold', min_agorot: 100_000 },
          { id: 'platinum', min_agorot: 1_000_000 },
        ],
        error: null,
      }) as never,
    )
    expect(read.source).toBe('defaults')
    expect(read.reason).toBe('thresholds are not strictly ascending')
    expect(warn).toHaveBeenCalledWith('club.tiers_rows_rejected', {
      reason: 'thresholds are not strictly ascending',
    })
  })

  it('answers the defaults when the read itself throws', async () => {
    const read = await readClubTiers(client(() => undefined as never) as never)
    expect(read.source).toBe('defaults')
    expect(read.reason).toBe('socket hang up')
    expect(warn).toHaveBeenCalledWith('club.tiers_read_threw', { message: 'socket hang up' })
  })
})
