import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The customer's gift card list (STEP 48). The judgement is proven in
 * lib/commerce/gift-card.test.ts; what can only fail here is that the read
 * runs on the SESSION client with no owner filter of its own (234's policy
 * names both owner columns), that a missing table is an empty list and not
 * a crash, and that each row knows whether this customer bought it or
 * received it.
 */

type Result = { data: unknown; error: unknown }

const chain: [string, unknown[]][] = []
let result: Result = { data: [], error: null }
const getUser = vi.fn()

function builder(): unknown {
  const proxy: unknown = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === 'then') {
          return (resolve: (v: Result) => unknown, reject?: (e: unknown) => unknown) =>
            Promise.resolve(result).then(resolve, reject)
        }
        return (...args: unknown[]) => {
          chain.push([String(prop), args])
          return proxy
        }
      },
    },
  )
  return proxy
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: () => getUser() },
    from: (table: string) => {
      chain.push(['from', [table]])
      return builder()
    },
  }),
}))
vi.mock('@/lib/observability/log', () => ({
  log: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}))

const ME = '11111111-1111-4111-8111-111111111111'
const OTHER = '22222222-2222-4222-8222-222222222222'

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: '33333333-3333-4333-8333-333333333333',
    code_last4: '7K2M',
    amount_agorot: 15000,
    status: 'issued',
    purchaser_user_id: ME,
    redeemed_by_user_id: null,
    recipient_name: 'דנה',
    recipient_email: 'dana@example.com',
    order_id: '44444444-4444-4444-8444-444444444444',
    issued_at: '2026-10-08T09:00:00.000Z',
    expires_at: '2031-10-08T09:00:00.000Z',
    redeemed_at: null,
    ...overrides,
  }
}

const { getMyGiftCards, toMyGiftCard } = await import('./gift-cards')

beforeEach(() => {
  chain.length = 0
  result = { data: [], error: null }
  getUser.mockReset()
  getUser.mockResolvedValue({ data: { user: { id: ME } } })
})

describe('getMyGiftCards', () => {
  it('is null without a session and never reads', async () => {
    getUser.mockResolvedValue({ data: { user: null } })
    expect(await getMyGiftCards()).toBeNull()
    expect(chain).toHaveLength(0)
  })

  it('reads gift_cards on the session client, newest first, with no owner filter in code', async () => {
    result = { data: [row()], error: null }
    const cards = await getMyGiftCards(new Date('2026-10-08T12:00:00Z'))
    expect(chain[0]).toEqual(['from', ['gift_cards']])
    expect(chain.some(([op]) => op === 'eq')).toBe(false)
    expect(chain).toEqual(
      expect.arrayContaining([
        ['order', ['issued_at', { ascending: false }]],
        ['limit', [100]],
      ]),
    )
    expect(cards).toHaveLength(1)
    expect(cards?.[0]).toMatchObject({
      codeLast4: '7K2M',
      amountAgorot: 15000,
      balanceAgorot: 15000,
      state: 'active',
      role: 'bought',
      recipientName: 'דנה',
    })
  })

  it('answers an empty list when 234 is not installed', async () => {
    result = { data: null, error: { code: 'PGRST205', message: 'not in schema cache' } }
    expect(await getMyGiftCards()).toEqual([])
  })
})

describe('toMyGiftCard', () => {
  const now = new Date('2026-10-08T12:00:00Z')

  it('a card someone else bought and I loaded is received, redeemed, worth zero here', () => {
    const card = toMyGiftCard(
      row({
        purchaser_user_id: OTHER,
        redeemed_by_user_id: ME,
        status: 'redeemed',
        redeemed_at: '2026-10-08T10:00:00.000Z',
      }),
      ME,
      now,
    )
    expect(card.role).toBe('received')
    expect(card.state).toBe('redeemed')
    expect(card.balanceAgorot).toBe(0)
    expect(card.amountAgorot).toBe(15000)
    expect(card.redeemedAt).toBe('2026-10-08T10:00:00.000Z')
  })

  it('a card I bought and loaded myself stays bought', () => {
    const card = toMyGiftCard(
      row({ redeemed_by_user_id: ME, status: 'redeemed', redeemed_at: '2026-10-08T10:00:00.000Z' }),
      ME,
      now,
    )
    expect(card.role).toBe('bought')
  })

  it('an issued card past its date reads expired with zero balance', () => {
    const card = toMyGiftCard(row({ expires_at: '2026-10-01T00:00:00.000Z' }), ME, now)
    expect(card.state).toBe('expired')
    expect(card.balanceAgorot).toBe(0)
  })
})
