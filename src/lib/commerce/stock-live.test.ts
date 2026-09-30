import { beforeEach, describe, expect, it, vi } from 'vitest'

const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
vi.mock('@/lib/observability/log', () => ({ log }))

type ProductRow = { stock_initial: number | null; low_stock_threshold: number | null } | null

const scenario = {
  rpcData: null as unknown,
  rpcError: null as { message: string } | null,
  row: null as ProductRow,
  rowError: null as { message: string } | null,
  throwOnCreate: false,
  throwValue: new Error('no client') as unknown,
}

function makeBuilder() {
  const builder: Record<string, unknown> = {}
  for (const method of ['select', 'eq', 'is']) builder[method] = () => builder
  builder.maybeSingle = () => Promise.resolve({ data: scenario.row, error: scenario.rowError })
  return builder
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => {
    if (scenario.throwOnCreate) throw scenario.throwValue
    return {
      rpc: () => Promise.resolve({ data: scenario.rpcData, error: scenario.rpcError }),
      from: () => makeBuilder(),
    }
  },
}))

const { readLiveStock, UNTRACKED_STOCK } = await import('./stock-live')

beforeEach(() => {
  vi.clearAllMocks()
  scenario.rpcData = null
  scenario.rpcError = null
  scenario.row = null
  scenario.rowError = null
  scenario.throwOnCreate = false
  scenario.throwValue = new Error('no client')
})

describe('readLiveStock', () => {
  it('skips the database entirely for an untracked product', async () => {
    await expect(readLiveStock('p-1', null)).resolves.toBe(UNTRACKED_STOCK)
    await expect(readLiveStock('p-1', undefined)).resolves.toBe(UNTRACKED_STOCK)
  })

  it('returns the available count with the cached initial level and threshold', async () => {
    scenario.rpcData = 7
    scenario.row = { stock_initial: 20, low_stock_threshold: 5 }

    await expect(readLiveStock('p-1', 20)).resolves.toEqual({
      available: 7,
      initial: 20,
      threshold: 5,
    })
  })

  it('falls back to untracked and logs when the RPC errors', async () => {
    scenario.rpcError = { message: 'function not found' }

    await expect(readLiveStock('p-1', 20)).resolves.toEqual(UNTRACKED_STOCK)
    expect(log.warn).toHaveBeenCalledWith(
      'stock.available_read_failed',
      expect.objectContaining({ productId: 'p-1', reason: 'function not found' }),
    )
  })

  it('falls back to untracked without logging when the RPC error is a prerender abort', async () => {
    scenario.rpcError = {
      message: 'During prerendering, fetch() rejects when the prerender is complete',
    }

    await expect(readLiveStock('p-1', 20)).resolves.toEqual(UNTRACKED_STOCK)
    expect(log.warn).not.toHaveBeenCalled()
  })

  it('never throws: a broken admin client still answers untracked', async () => {
    scenario.throwOnCreate = true

    await expect(readLiveStock('p-1', 20)).resolves.toEqual(UNTRACKED_STOCK)
    expect(log.warn).toHaveBeenCalledWith(
      'stock.available_read_threw',
      expect.objectContaining({ productId: 'p-1', reason: 'no client' }),
    )
  })

  it('treats a missing product row as no initial level or threshold, not a failure', async () => {
    scenario.rpcData = 3
    scenario.row = null

    await expect(readLiveStock('p-1', 20)).resolves.toEqual({
      available: 3,
      initial: null,
      threshold: null,
    })
    expect(log.warn).not.toHaveBeenCalled()
  })

  it('treats a non-numeric RPC result (no error) as available: null, not a crash', async () => {
    scenario.rpcData = null
    scenario.row = { stock_initial: 20, low_stock_threshold: 5 }

    await expect(readLiveStock('p-1', 20)).resolves.toEqual({
      available: null,
      initial: 20,
      threshold: 5,
    })
  })

  it('answers untracked without logging when the thrown error is a prerender abort', async () => {
    scenario.throwOnCreate = true
    scenario.throwValue = { digest: 'HANGING_PROMISE_REJECTION' }

    await expect(readLiveStock('p-1', 20)).resolves.toEqual(UNTRACKED_STOCK)
    expect(log.warn).not.toHaveBeenCalled()
  })

  it('logs "unknown" when the thrown value is not an Error', async () => {
    scenario.throwOnCreate = true
    scenario.throwValue = 'no client'

    await expect(readLiveStock('p-1', 20)).resolves.toEqual(UNTRACKED_STOCK)
    expect(log.warn).toHaveBeenCalledWith(
      'stock.available_read_threw',
      expect.objectContaining({ productId: 'p-1', reason: 'unknown' }),
    )
  })
})
