import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

let viewRow: unknown = null
const tiers = [
  { key: 'bronze', name_he: 'ארד', min_spend_agorot: 0, benefits_json: [], sort_order: 10 },
  { key: 'silver', name_he: 'כסף', min_spend_agorot: 50_000, benefits_json: [], sort_order: 20 },
]

function query(table: string) {
  const q: Record<string, unknown> = {}
  const self = () => q
  q.select = self
  q.eq = self
  q.order = self
  q.maybeSingle = async () => ({ data: viewRow, error: null })
  q.limit = async () => ({ data: table === 'club_tiers' ? tiers : [], error: null })
  return q
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
    from: (table: string) => query(table),
  }),
}))

const { getMyTier } = await import('./club')

beforeEach(() => {
  viewRow = null
})

describe('getMyTier', () => {
  it('reads the view row when the customer has spend', async () => {
    viewRow = {
      spend_agorot: 83_500,
      tier_key: 'silver',
      tier_name_he: 'כסף',
      tier_benefits_json: ['משלוח חינם', 3],
      next_tier_name_he: 'זהב',
      to_next_agorot: 116_500,
    }
    await expect(getMyTier()).resolves.toEqual({
      tierKey: 'silver',
      tierNameHe: 'כסף',
      benefits: ['משלוח חינם'],
      spendAgorot: 83_500,
      nextTierNameHe: 'זהב',
      toNextAgorot: 116_500,
    })
  })

  it('puts a customer with no paid spend on the lowest tier', async () => {
    await expect(getMyTier()).resolves.toEqual({
      tierKey: 'bronze',
      tierNameHe: 'ארד',
      benefits: [],
      spendAgorot: 0,
      nextTierNameHe: 'כסף',
      toNextAgorot: 50_000,
    })
  })
})
