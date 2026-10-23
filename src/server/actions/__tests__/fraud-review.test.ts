import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  approveFlaggedOrder,
  getFlaggedOrderDetails,
  getFlaggedOrders,
  getFraudStatistics,
  getProfileChargebackHistory,
  rejectFlaggedOrder,
  requestManualReview,
} from '../fraud-review'

/**
 * The fraud-review actions decide on other customers' orders, so the contract
 * under test is mostly WHO may call them: no session, a customer session and an
 * admin session are three different answers. The Supabase client is a recording
 * stub: every builder method returns the builder, and awaiting it yields
 * whatever `result` holds.
 */

type Result = { data: unknown; error: { message: string } | null }

const state = {
  user: null as { id: string } | null,
  role: 'customer' as string | null,
  result: { data: [], error: null } as Result,
  calls: [] as Array<{ table: string; method: string; args: unknown[] }>,
}

function builderFor(table: string) {
  const builder: Record<string, unknown> = {}
  for (const method of [
    'select',
    'update',
    'insert',
    'eq',
    'gt',
    'order',
    'range',
    'single',
    'maybeSingle',
  ]) {
    builder[method] = (...args: unknown[]) => {
      state.calls.push({ table, method, args })
      return builder
    }
  }
  // biome-ignore lint/suspicious/noThenProperty: a PostgREST builder is a thenable
  builder.then = (resolve: (value: unknown) => unknown) =>
    resolve(
      table === 'profiles'
        ? { data: state.role ? { role: state.role } : null, error: null }
        : { ...state.result },
    )
  return builder
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({ data: { user: state.user }, error: null }),
    },
    from: (table: string) => builderFor(table),
  }),
}))

const signedOut = () => {
  state.user = null
}
const asCustomer = () => {
  state.user = { id: 'user-1' }
  state.role = 'customer'
}
const asAdmin = () => {
  state.user = { id: 'admin-1' }
  state.role = 'admin'
}

const callsTo = (table: string, method: string) =>
  state.calls.filter((c) => c.table === table && c.method === method)

beforeEach(() => {
  state.user = null
  state.role = 'customer'
  state.result = { data: [], error: null }
  state.calls = []
})

describe('Fraud Review Actions', () => {
  describe('who may call them', () => {
    const everyAction: Array<[string, () => Promise<{ error?: string }>]> = [
      ['getFlaggedOrders', () => getFlaggedOrders()],
      ['getFlaggedOrderDetails', () => getFlaggedOrderDetails('flag-1')],
      ['approveFlaggedOrder', () => approveFlaggedOrder('flag-1')],
      ['rejectFlaggedOrder', () => rejectFlaggedOrder('flag-1')],
      ['requestManualReview', () => requestManualReview('flag-1')],
      ['getFraudStatistics', () => getFraudStatistics()],
      ['getProfileChargebackHistory', () => getProfileChargebackHistory('profile-1')],
    ]

    it.each(everyAction)('%s turns away a visitor with no session', async (_name, call) => {
      signedOut()
      const result = await call()
      expect(result.error).toContain('authenticated')
      expect(state.calls).toEqual([])
    })

    it.each(everyAction)('%s turns away a signed-in customer', async (_name, call) => {
      asCustomer()
      const result = await call()
      expect(result.error).toBe('Not authorized')
      // Only the role lookup happened; nothing touched the fraud tables.
      expect(state.calls.every((c) => c.table === 'profiles')).toBe(true)
    })
  })

  describe('getFlaggedOrders', () => {
    it('fetches pending flags by default', async () => {
      asAdmin()
      state.result = { data: [{ id: 'flag-1' }], error: null }

      const result = await getFlaggedOrders()

      expect(result).toEqual({ data: [{ id: 'flag-1' }] })
      expect(callsTo('fraud_flags', 'eq')[0]?.args).toEqual(['status', 'pending'])
    })

    it('respects the status filter', async () => {
      asAdmin()
      await getFlaggedOrders('approved')
      expect(callsTo('fraud_flags', 'eq')[0]?.args).toEqual(['status', 'approved'])
    })

    it('pages with offset and limit', async () => {
      asAdmin()
      await getFlaggedOrders('pending', 20, 40)
      expect(callsTo('fraud_flags', 'range')[0]?.args).toEqual([40, 59])
    })

    it('reports a failed read instead of an empty list', async () => {
      asAdmin()
      state.result = { data: null, error: { message: 'boom' } }
      await expect(getFlaggedOrders()).resolves.toEqual({
        error: 'Failed to fetch flagged orders: boom',
      })
    })
  })

  describe('getFlaggedOrderDetails', () => {
    it('fetches one flag with its order and signals', async () => {
      asAdmin()
      state.result = { data: { id: 'flag-1', fraud_signals: [] }, error: null }

      const result = await getFlaggedOrderDetails('flag-1')

      expect(result).toEqual({ data: { id: 'flag-1', fraud_signals: [] } })
      expect(callsTo('fraud_flags', 'eq')[0]?.args).toEqual(['id', 'flag-1'])
      expect(String(callsTo('fraud_flags', 'select')[0]?.args[0])).toContain('fraud_signals')
    })
  })

  describe('approveFlaggedOrder', () => {
    it('marks the flag approved and records the reviewer and notes', async () => {
      asAdmin()
      state.result = { data: { id: 'flag-1' }, error: null }

      const result = await approveFlaggedOrder('flag-1', 'False alarm')

      expect(result).toMatchObject({ success: true })
      expect(callsTo('fraud_flags', 'update')[0]?.args[0]).toMatchObject({
        status: 'approved',
        reviewed_by: 'admin-1',
        review_notes: 'False alarm',
      })
    })
  })

  describe('rejectFlaggedOrder', () => {
    it('records the chosen action on the flag', async () => {
      asAdmin()
      state.result = { data: { id: 'flag-1', order_id: 'order-1' }, error: null }

      const result = await rejectFlaggedOrder('flag-1', 'hold', 'Suspicious activity')

      expect(result).toMatchObject({ success: true })
      expect(callsTo('fraud_flags', 'update')[0]?.args[0]).toMatchObject({
        status: 'rejected',
        action: 'hold',
        reviewed_by: 'admin-1',
      })
      expect(callsTo('orders', 'update')).toHaveLength(0)
    })

    it('leaves the order alone unless the action is cancel', async () => {
      asAdmin()
      state.result = { data: { id: 'flag-1', order_id: 'order-1' }, error: null }
      for (const action of ['hold', 'require_verification'] as const) {
        await rejectFlaggedOrder('flag-1', action)
      }
      expect(callsTo('orders', 'update')).toHaveLength(0)
    })

    it('cancels the order when the action is cancel', async () => {
      asAdmin()
      state.result = { data: { id: 'flag-1', order_id: 'order-1' }, error: null }

      await rejectFlaggedOrder('flag-1', 'cancel')

      expect(callsTo('orders', 'update')[0]?.args[0]).toMatchObject({ status: 'cancelled' })
      expect(callsTo('orders', 'eq')[0]?.args).toEqual(['id', 'order-1'])
    })
  })

  describe('requestManualReview', () => {
    it('moves the flag to manual_review with the notes', async () => {
      asAdmin()
      state.result = { data: { id: 'flag-1' }, error: null }

      const result = await requestManualReview('flag-1', 'Needs human review')

      expect(result).toMatchObject({ success: true })
      expect(callsTo('fraud_flags', 'update')[0]?.args[0]).toMatchObject({
        status: 'manual_review',
        review_notes: 'Needs human review',
      })
    })
  })

  describe('getFraudStatistics', () => {
    it('returns the last 24 hours of counts', async () => {
      asAdmin()

      const result = await getFraudStatistics()

      expect(result).toMatchObject({
        data: { statusCounts: [], riskCounts: [], topSignals: [], period: '24h' },
      })
    })

    it('fails as a whole when any of the three reads fails', async () => {
      asAdmin()
      state.result = { data: null, error: { message: 'boom' } }
      await expect(getFraudStatistics()).resolves.toEqual({ error: 'Failed to fetch statistics' })
    })
  })

  describe('getProfileChargebackHistory', () => {
    it("returns one profile's chargebacks, newest first", async () => {
      asAdmin()
      state.result = { data: [{ id: 'cb-1' }], error: null }

      const result = await getProfileChargebackHistory('profile-1')

      expect(result).toEqual({ data: [{ id: 'cb-1' }] })
      expect(callsTo('chargeback_history', 'eq')[0]?.args).toEqual(['profile_id', 'profile-1'])
      expect(callsTo('chargeback_history', 'order')[0]?.args).toEqual([
        'chargeback_date',
        { ascending: false },
      ])
    })
  })
})
