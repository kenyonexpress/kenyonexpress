import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * `getClubStanding` against a scripted admin client: what it asks the
 * database for, what it does with the rows, and that a failed read is an
 * error and not "member, ₪0".
 */

type Result = { data: unknown; error: unknown }
let ordersResult: Result = { data: [], error: null }
// `club_tiers` (pending 251): absent by default, the way production is today.
let tiersResult: Result = { data: null, error: { code: 'PGRST205', message: 'not found' } }
const calls: { method: string; args: unknown[] }[] = []

/** The thresholds read is its own builder and is not recorded in `calls`. */
function tiersBuilder() {
  return {
    select: () => ({
      // biome-ignore lint/suspicious/noThenProperty: thenable stand-in for the Supabase builder
      then: (resolve: (v: unknown) => unknown) => resolve({ ...tiersResult }),
    }),
  }
}

function tableBuilder() {
  const builder: Record<string, unknown> = {}
  for (const method of ['select', 'eq', 'in', 'is', 'gte', 'limit']) {
    builder[method] = (...args: unknown[]) => {
      calls.push({ method, args })
      return builder
    }
  }
  // biome-ignore lint/suspicious/noThenProperty: the Supabase builder is a thenable and the read awaits it with no terminal
  builder.then = (resolve: (v: unknown) => unknown) => resolve({ ...ordersResult })
  return builder
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => (table === 'club_tiers' ? tiersBuilder() : tableBuilder()),
  }),
}))
let user: { id: string } | null = { id: 'u-1' }
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user } }) } }),
}))
vi.mock('@/lib/commerce/order-money-columns', () => ({
  moneyColumnProbe: () => async () => true,
  resolveOrderGeneration: async () => 'ils',
  orderMoneySelect: () => 'total_ils_agorot',
  readOrderMoney: (_g: unknown, row: Record<string, unknown> | null | undefined) => ({
    subtotalAgorot: 0,
    totalAgorot: Number(row?.total_ils_agorot ?? 0),
    walletAppliedAgorot: 0,
  }),
}))
const logError = vi.fn()
vi.mock('@/lib/observability/log', () => ({
  log: { error: (...a: unknown[]) => logError(...a), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}))

const { getClubStanding } = await import('./club')

const now = new Date('2026-09-25T12:00:00Z')

beforeEach(() => {
  calls.length = 0
  ordersResult = { data: [], error: null }
  tiersResult = { data: null, error: { code: 'PGRST205', message: 'not found' } }
  user = { id: 'u-1' }
  logError.mockReset()
})

describe('getClubStanding', () => {
  it('answers null with no session and reads nothing', async () => {
    user = null
    expect(await getClubStanding(now)).toBeNull()
    expect(calls).toHaveLength(0)
  })

  it('reads only the signed-in user, undeleted, paid-and-kept, inside the window', async () => {
    await getClubStanding(now)
    const by = (method: string) => calls.filter((c) => c.method === method).map((c) => c.args)
    expect(by('eq')).toEqual([['user_id', 'u-1']])
    expect(by('is')).toEqual([['deleted_at', null]])
    expect(by('in')).toEqual([
      ['status', ['paid', 'partially_fulfilled', 'fulfilled', 'platform_settled']],
    ])
    expect(by('gte')).toEqual([['created_at', '2025-09-25T12:00:00.000Z']])
    expect(by('select')[0]?.[0]).toBe('status, paid_at, created_at, total_ils_agorot')
  })

  it('sums the charged totals through the generation reader and returns the standing', async () => {
    ordersResult = {
      data: [
        {
          status: 'paid',
          paid_at: '2026-09-01T00:00:00Z',
          created_at: '2026-09-01T00:00:00Z',
          total_ils_agorot: 80_000,
        },
        {
          status: 'fulfilled',
          paid_at: '2026-08-01T00:00:00Z',
          created_at: '2026-08-01T00:00:00Z',
          total_ils_agorot: 70_000,
        },
        // Inside the created_at filter but paid before the window: the exact rule drops it.
        {
          status: 'paid',
          paid_at: '2025-09-25T11:00:00Z',
          created_at: '2025-09-25T11:00:00Z',
          total_ils_agorot: 999_999,
        },
      ],
      error: null,
    }
    const standing = await getClubStanding(now)
    expect(standing?.spendAgorot).toBe(150_000)
    expect(standing?.tier.id).toBe('silver')
    expect(standing?.nextTier?.id).toBe('gold')
    expect(standing?.remainingAgorot).toBe(150_000)
    expect(standing?.progressPercent).toBe(25)
  })

  it('takes the thresholds from club_tiers when the table answers, and the same spend lands in a different tier', async () => {
    ordersResult = {
      data: [
        {
          status: 'paid',
          paid_at: '2026-09-01T00:00:00Z',
          created_at: '2026-09-01T00:00:00Z',
          total_ils_agorot: 150_000,
        },
      ],
      error: null,
    }
    tiersResult = {
      data: [
        { id: 'member', min_agorot: 0 },
        { id: 'silver', min_agorot: 50_000 },
        { id: 'gold', min_agorot: 120_000 },
        { id: 'platinum', min_agorot: '500000' },
      ],
      error: null,
    }
    const standing = await getClubStanding(now)
    expect(standing?.tier.id).toBe('gold')
    expect(standing?.nextTier?.id).toBe('platinum')
    expect(standing?.remainingAgorot).toBe(350_000)
    // (150000 - 120000) * 100 / (500000 - 120000) = 7.89 -> 8
    expect(standing?.progressPercent).toBe(8)
  })

  it('falls back to the compiled thresholds when the table rows do not validate', async () => {
    ordersResult = {
      data: [
        {
          status: 'paid',
          paid_at: '2026-09-01T00:00:00Z',
          created_at: '2026-09-01T00:00:00Z',
          total_ils_agorot: 150_000,
        },
      ],
      error: null,
    }
    // gold below silver: an operator mid-edit, or a bad write. Not a tier rule.
    tiersResult = {
      data: [
        { id: 'member', min_agorot: 0 },
        { id: 'silver', min_agorot: 200_000 },
        { id: 'gold', min_agorot: 100_000 },
        { id: 'platinum', min_agorot: 1_000_000 },
      ],
      error: null,
    }
    const standing = await getClubStanding(now)
    expect(standing?.tier.id).toBe('silver')
    expect(standing?.nextTier?.minAgorot).toBe(300_000)
  })

  it('throws and logs on a failed read instead of answering member with nothing spent', async () => {
    ordersResult = { data: null, error: { code: '57014', message: 'statement timeout' } }
    await expect(getClubStanding(now)).rejects.toThrow('club.spend_read_failed')
    expect(logError).toHaveBeenCalledWith(
      'club.spend_read_failed',
      expect.objectContaining({ userId: 'u-1' }),
    )
  })
})
