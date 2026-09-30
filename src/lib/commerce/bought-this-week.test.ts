import { beforeEach, describe, expect, it, vi } from 'vitest'

const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
vi.mock('@/lib/observability/log', () => ({ log }))

type Result = { data: unknown; error: unknown }

const scenario = {
  items: { data: [], error: null } as Result,
  payments: { data: [], error: null } as Result,
  throwOnCreate: false,
  throwValue: new Error('no client') as unknown,
}

const paymentsInCalls: unknown[] = []

function makeBuilder() {
  let table = ''
  const builder: Record<string, unknown> = {}
  for (const method of ['select', 'eq', 'is', 'not', 'gte']) builder[method] = () => builder
  builder.in = (_column: string, value: unknown) => {
    if (table === 'payments') paymentsInCalls.push(value)
    return builder
  }
  builder.from = (t: string) => {
    table = t
    return builder
  }
  // biome-ignore lint/suspicious/noThenProperty: a PostgREST builder is thenable
  builder.then = (resolve: (v: Result) => unknown) => {
    if (table === 'order_items') return resolve(scenario.items)
    if (table === 'payments') return resolve(scenario.payments)
    return resolve({ data: null, error: null })
  }
  return builder
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => {
    if (scenario.throwOnCreate) throw scenario.throwValue
    return makeBuilder()
  },
}))

const { readBoughtThisWeek } = await import('./bought-this-week')

beforeEach(() => {
  vi.clearAllMocks()
  paymentsInCalls.length = 0
  scenario.items = { data: [], error: null }
  scenario.payments = { data: [], error: null }
  scenario.throwOnCreate = false
  scenario.throwValue = new Error('no client')
})

describe('readBoughtThisWeek', () => {
  it('sums quantity only for orders backed by a real charge', async () => {
    scenario.items = {
      data: [
        { order_id: 'real-1', quantity: 2 },
        { order_id: 'mock-1', quantity: 18 },
      ],
      error: null,
    }
    scenario.payments = {
      data: [
        { order_id: 'real-1', cardcom_transaction_id: 'txn-123' },
        { order_id: 'mock-1', cardcom_transaction_id: 'mock-txn-9' },
      ],
      error: null,
    }

    await expect(readBoughtThisWeek('p-1')).resolves.toBe(2)
  })

  it('is zero with no items read, and never queries payments', async () => {
    scenario.items = { data: [], error: null }

    await expect(readBoughtThisWeek('p-1')).resolves.toBe(0)
    expect(paymentsInCalls).toHaveLength(0)
  })

  it('is zero and logs when the order_items read fails', async () => {
    scenario.items = { data: null, error: { message: 'timeout' } }

    await expect(readBoughtThisWeek('p-1')).resolves.toBe(0)
    expect(log.warn).toHaveBeenCalledWith(
      'social_proof.items_read_failed',
      expect.objectContaining({ productId: 'p-1', reason: 'timeout' }),
    )
  })

  it('is zero and logs when the payments read fails', async () => {
    scenario.items = { data: [{ order_id: 'real-1', quantity: 2 }], error: null }
    scenario.payments = { data: null, error: { message: 'timeout' } }

    await expect(readBoughtThisWeek('p-1')).resolves.toBe(0)
    expect(log.warn).toHaveBeenCalledWith(
      'social_proof.payments_read_failed',
      expect.objectContaining({ productId: 'p-1', reason: 'timeout' }),
    )
  })

  it('never throws: a broken admin client still answers zero', async () => {
    scenario.throwOnCreate = true

    await expect(readBoughtThisWeek('p-1')).resolves.toBe(0)
    expect(log.warn).toHaveBeenCalledWith(
      'social_proof.read_threw',
      expect.objectContaining({ productId: 'p-1', reason: 'no client' }),
    )
  })

  it('treats a null items read (no error) as no rows, not a crash', async () => {
    scenario.items = { data: null, error: null }

    await expect(readBoughtThisWeek('p-1')).resolves.toBe(0)
    expect(paymentsInCalls).toHaveLength(0)
  })

  it('treats a null payments read (no error) as no real orders', async () => {
    scenario.items = { data: [{ order_id: 'real-1', quantity: 2 }], error: null }
    scenario.payments = { data: null, error: null }

    await expect(readBoughtThisWeek('p-1')).resolves.toBe(0)
  })

  it('logs "unknown" when the admin client throws something other than an Error', async () => {
    scenario.throwOnCreate = true
    scenario.throwValue = 'no client'

    await expect(readBoughtThisWeek('p-1')).resolves.toBe(0)
    expect(log.warn).toHaveBeenCalledWith(
      'social_proof.read_threw',
      expect.objectContaining({ productId: 'p-1', reason: 'unknown' }),
    )
  })

  it('queries payments once per distinct order, not once per item row', async () => {
    scenario.items = {
      data: [
        { order_id: 'real-1', quantity: 1 },
        { order_id: 'real-1', quantity: 1 },
        { order_id: 'real-2', quantity: 3 },
      ],
      error: null,
    }
    scenario.payments = {
      data: [
        { order_id: 'real-1', cardcom_transaction_id: 'txn-1' },
        { order_id: 'real-2', cardcom_transaction_id: 'txn-2' },
      ],
      error: null,
    }

    await expect(readBoughtThisWeek('p-1')).resolves.toBe(5)
    expect(paymentsInCalls).toEqual([['real-1', 'real-2']])
  })
})
