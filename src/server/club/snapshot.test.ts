import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The tier snapshot on a new order: what it writes, and that nothing it does
 * can fail the checkout that called it.
 */

const warn = vi.fn()
vi.mock('@/lib/observability/log', () => ({
  log: { warn: (...a: unknown[]) => warn(...a), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}))

const compute = vi.fn()
vi.mock('@/server/queries/club', () => ({
  computeClubStanding: (...a: unknown[]) => compute(...a),
}))

const { snapshotClubTierOnOrder } = await import('./snapshot')

const updates: { payload: unknown; filters: unknown[][] }[] = []
let updateResult: { error: { code?: string; message: string } | null } = { error: null }

const admin = {
  from: (table: string) => {
    expect(table).toBe('orders')
    return {
      update: (payload: unknown) => {
        const entry = { payload, filters: [] as unknown[][] }
        updates.push(entry)
        return {
          eq: (...args: unknown[]) => {
            entry.filters.push(args)
            return Promise.resolve(updateResult)
          },
        }
      },
    }
  },
}

const now = new Date('2026-10-05T10:00:00Z')

beforeEach(() => {
  updates.length = 0
  updateResult = { error: null }
  warn.mockReset()
  compute.mockReset()
  compute.mockResolvedValue({ tier: { id: 'gold', minAgorot: 300_000 }, spendAgorot: 450_000 })
})

describe('snapshotClubTierOnOrder', () => {
  it('writes the tier id and the spend that earned it onto exactly that order', async () => {
    const out = await snapshotClubTierOnOrder(admin as never, {
      orderId: 'o-1',
      userId: 'u-1',
      now,
    })
    expect(out).toEqual({ recorded: true, tier: 'gold' })
    expect(compute).toHaveBeenCalledWith(admin, 'u-1', now)
    expect(updates).toEqual([
      { payload: { club_tier: 'gold', club_spend_agorot: 450_000 }, filters: [['id', 'o-1']] },
    ])
    expect(warn).not.toHaveBeenCalled()
  })

  it('warns and stands down when the column is not there yet (251 unapplied)', async () => {
    updateResult = { error: { code: 'PGRST204', message: "column 'club_tier' does not exist" } }
    const out = await snapshotClubTierOnOrder(admin as never, {
      orderId: 'o-1',
      userId: 'u-1',
      now,
    })
    expect(out).toEqual({ recorded: false })
    expect(warn).toHaveBeenCalledWith(
      'checkout.club_tier_not_recorded',
      expect.objectContaining({ order_id: 'o-1', code: 'PGRST204' }),
    )
  })

  it('never throws: a failed standing read is a warning, not a failed checkout', async () => {
    compute.mockRejectedValue(new Error('club.spend_read_failed'))
    const out = await snapshotClubTierOnOrder(admin as never, {
      orderId: 'o-1',
      userId: 'u-1',
      now,
    })
    expect(out).toEqual({ recorded: false })
    expect(updates).toEqual([])
    expect(warn).toHaveBeenCalledWith('checkout.club_tier_not_recorded', {
      order_id: 'o-1',
      err: 'club.spend_read_failed',
    })
  })
})
