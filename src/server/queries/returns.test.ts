import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The read side of the return request. What can only fail here: the row
 * mapper's two fallbacks (derived RMA, reason code from the pre-259 label
 * line), which client each read uses (the customer's on the REQUEST client so
 * 131's owner policy is the scope), and the open-state filter the action
 * and the admin page rely on.
 */

const userFrom = vi.hoisted(() => vi.fn())
const adminFrom = vi.hoisted(() => vi.fn())

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ from: userFrom }),
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: adminFrom }),
}))
vi.mock('@/lib/observability/log', () => ({
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

import {
  OPEN_RETURN_STATES,
  getMyReturnForOrder,
  getMyReturnRequests,
  getOpenReturnForOrder,
  listReturnRequestsForAdmin,
  returnFromRow,
} from './returns'

const ID = '8f3c2a1b-7d6e-4f50-9a1b-2c3d4e5f6a7b'
const ROW = {
  id: ID,
  order_id: 'order-1',
  state: 'requested',
  ground: 'defect',
  destination: 'wallet',
  requested_agorot: 12_300,
  granted_agorot: null,
  cancellation_fee_agorot: 0,
  requested_at: '2026-10-08T10:00:00.000Z',
  decided_at: null,
  completed_at: null,
  refund_due_by: '2026-10-22T10:00:00.000Z',
  reason_he: 'המוצר פגום\nהגיע שבור',
  internal_note: null,
  requested_by: 'user-1',
}

/** A chainable, awaitable stub whose terminal answer is fixed. */
function chain(result: { data: unknown; error: unknown }, record: string[][] = []) {
  const proxy: unknown = new Proxy(
    {},
    {
      get(_t, prop) {
        if (prop === 'then') {
          return (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve)
        }
        return (...args: unknown[]) => {
          record.push([String(prop), ...args.map((a) => JSON.stringify(a))])
          return proxy
        }
      },
    },
  )
  return proxy
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('returnFromRow', () => {
  it('derives the RMA and reads the reason code off the label line before 259', () => {
    const out = returnFromRow(ROW)
    expect(out).toMatchObject({
      id: ID,
      orderId: 'order-1',
      rma: 'RMA-261008-8F3C2A1B',
      state: 'requested',
      ground: 'defect',
      reasonCode: 'defective',
      destination: 'wallet',
      note: 'הגיע שבור',
      requestedAgorot: 12_300,
      grantedAgorot: null,
      refundDueBy: '2026-10-22T10:00:00.000Z',
    })
  })

  it('prefers the stored RMA and reason code once 259 is applied', () => {
    const out = returnFromRow({
      ...ROW,
      rma_number: 'RMA-261008-8F3C2A1B',
      reason_code: 'wrong_item',
    })
    expect(out?.rma).toBe('RMA-261008-8F3C2A1B')
    expect(out?.reasonCode).toBe('wrong_item')
  })

  it('keeps free text as the note when the first line is not a known label', () => {
    const out = returnFromRow({ ...ROW, reason_he: 'ביטול עסקה' })
    expect(out?.reasonCode).toBeNull()
    expect(out?.note).toBe('ביטול עסקה')
  })

  it('defaults a missing destination to the card and derives a missing deadline', () => {
    const { destination: _d, refund_due_by: _r, ...rest } = ROW
    void _d
    void _r
    const out = returnFromRow(rest)
    expect(out?.destination).toBe('original_method')
    expect(out?.refundDueBy).toBe('2026-10-22T10:00:00.000Z')
  })

  it('reads bigint columns that arrive as strings', () => {
    const out = returnFromRow({ ...ROW, requested_agorot: '12300', granted_agorot: '12300' })
    expect(out?.requestedAgorot).toBe(12_300)
    expect(out?.grantedAgorot).toBe(12_300)
  })

  it('returns null for a row missing its identity', () => {
    expect(returnFromRow({ ...ROW, id: null })).toBeNull()
  })
})

describe('customer reads use the request client', () => {
  it('getMyReturnRequests lists newest first without a filter (RLS scopes)', async () => {
    const record: string[][] = []
    userFrom.mockReturnValue(chain({ data: [ROW], error: null }, record))
    const out = await getMyReturnRequests()
    expect(userFrom).toHaveBeenCalledWith('refunds')
    expect(adminFrom).not.toHaveBeenCalled()
    expect(out).toHaveLength(1)
    expect(record).toEqual([
      ['select', '"*"'],
      ['order', '"requested_at"', '{"ascending":false}'],
    ])
  })

  it('getMyReturnForOrder returns the latest row for that order, or null', async () => {
    const record: string[][] = []
    userFrom.mockReturnValue(chain({ data: [ROW], error: null }, record))
    expect((await getMyReturnForOrder('order-1'))?.rma).toBe('RMA-261008-8F3C2A1B')
    expect(record[1]).toEqual(['eq', '"order_id"', '"order-1"'])
    userFrom.mockReturnValue(chain({ data: [], error: null }))
    expect(await getMyReturnForOrder('order-1')).toBeNull()
  })

  it('swallows a read error as an empty answer and logs', async () => {
    userFrom.mockReturnValue(chain({ data: null, error: { code: '42501', message: 'denied' } }))
    expect(await getMyReturnRequests()).toEqual([])
  })
})

describe('service-role reads', () => {
  it('getOpenReturnForOrder filters to the three open states', async () => {
    const record: string[][] = []
    adminFrom.mockReturnValue(chain({ data: [ROW], error: null }, record))
    const out = await getOpenReturnForOrder('order-1')
    expect(out?.state).toBe('requested')
    expect(record).toContainEqual(['in', '"state"', JSON.stringify([...OPEN_RETURN_STATES])])
    expect(OPEN_RETURN_STATES).toEqual(['requested', 'approved', 'executing'])
  })

  it('listReturnRequestsForAdmin joins the requester profile and orders oldest first', async () => {
    const record: string[][] = []
    adminFrom.mockImplementation((table: string) => {
      if (table === 'refunds') return chain({ data: [ROW], error: null }, record)
      if (table === 'profiles') {
        return chain({
          data: [{ id: 'user-1', email: 'dana@example.com', full_name: 'דנה' }],
          error: null,
        })
      }
      throw new Error(`unexpected table ${table}`)
    })
    const out = await listReturnRequestsForAdmin({})
    expect(out[0]).toMatchObject({
      rma: 'RMA-261008-8F3C2A1B',
      customerEmail: 'dana@example.com',
      customerName: 'דנה',
    })
    expect(record).toContainEqual(['in', '"state"', '["requested","approved"]'])
    expect(record).toContainEqual(['order', '"requested_at"', '{"ascending":true}'])
  })
})
