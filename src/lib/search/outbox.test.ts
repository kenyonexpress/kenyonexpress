import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The outbox drain, with Postgres mocked at the RPC boundary.
 *
 * What is pinned here is the failure behaviour, because every one of these
 * cases is silent in production: a poison row that stalls the queue, a
 * completion that closes a row somebody else re-enqueued, and a drain that
 * reports success while indexing nothing all look identical from outside.
 */

const rpcCalls: { fn: string; args: Record<string, unknown> }[] = []
let claimRows: unknown = []
let claimError: { message: string } | null = null
let completeError: { message: string } | null = null

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    rpc: (fn: string, args: Record<string, unknown>) => {
      rpcCalls.push({ fn, args })
      if (fn === 'fn_claim_search_outbox') {
        return Promise.resolve({ data: claimRows, error: claimError })
      }
      if (fn === 'fn_complete_search_outbox') {
        return Promise.resolve({ data: null, error: completeError })
      }
      return Promise.resolve({ data: null, error: null })
    },
  }),
}))

const { drainSearchOutbox } = await import('@/lib/search/outbox')

const PRODUCT_A = '3e9a4f6c-1b2d-4c5e-8f7a-9b0c1d2e3f4a'
const PRODUCT_B = '9f8e7d6c-5b4a-3c2d-1e0f-a1b2c3d4e5f6'

function row(id: number, productId: string, op: 'upsert' | 'delete' = 'upsert') {
  return { id, product_id: productId, op, reason: 'update:active', attempts: 1 }
}

function callsTo(fn: string) {
  return rpcCalls.filter((call) => call.fn === fn)
}

beforeEach(() => {
  rpcCalls.length = 0
  claimRows = []
  claimError = null
  completeError = null
})

describe('drainSearchOutbox', () => {
  it('does nothing, and reports nothing, when the queue is empty', async () => {
    const result = await drainSearchOutbox({ run: vi.fn() })
    expect(result).toEqual({ claimed: 0, indexed: 0, failed: 0, errors: [] })
    // No completion call on an empty batch: `id = ANY('{}')` is a pointless
    // round trip on every scheduler tick, and there are a lot of ticks.
    expect(callsTo('fn_complete_search_outbox')).toHaveLength(0)
    expect(callsTo('fn_fail_search_outbox')).toHaveLength(0)
  })

  it('runs each claimed job and completes them under one claim token', async () => {
    claimRows = [row(1, PRODUCT_A), row(2, PRODUCT_B, 'delete')]
    const run = vi.fn().mockResolvedValue('ok')

    const result = await drainSearchOutbox({ run })

    expect(result).toMatchObject({ claimed: 2, indexed: 2, failed: 0 })
    expect(run).toHaveBeenCalledTimes(2)
    expect(run.mock.calls[0]?.[0]).toMatchObject({ op: 'upsert', productId: PRODUCT_A })
    expect(run.mock.calls[1]?.[0]).toMatchObject({ op: 'delete', productId: PRODUCT_B })

    const complete = callsTo('fn_complete_search_outbox')[0]
    expect(complete?.args.p_ids).toEqual([1, 2])
    // The SAME token the claim used. Completion matches on it in SQL, so a
    // mismatch here would silently close nothing and re-index forever.
    expect(complete?.args.p_token).toBe(callsTo('fn_claim_search_outbox')[0]?.args.p_token)
  })

  it('generates a fresh claim token per drain', async () => {
    claimRows = [row(1, PRODUCT_A)]
    const run = vi.fn().mockResolvedValue('ok')
    await drainSearchOutbox({ run })
    await drainSearchOutbox({ run })
    const [first, second] = callsTo('fn_claim_search_outbox')
    expect(first?.args.p_token).not.toBe(second?.args.p_token)
  })

  it('lets the rest of the batch through when one job throws', async () => {
    // The whole reason failures are collected: one product with a broken image
    // array must not park the other twenty-four behind it.
    claimRows = [row(1, PRODUCT_A), row(2, PRODUCT_B)]
    const run = vi
      .fn()
      .mockRejectedValueOnce(new Error('meili 503'))
      .mockResolvedValueOnce('upserted')

    const result = await drainSearchOutbox({ run })

    expect(result).toMatchObject({ claimed: 2, indexed: 1, failed: 1 })
    expect(result.errors[0]).toContain(PRODUCT_A)
    expect(result.errors[0]).toContain('meili 503')
    expect(callsTo('fn_complete_search_outbox')[0]?.args.p_ids).toEqual([2])
    expect(callsTo('fn_fail_search_outbox')[0]?.args.p_ids).toEqual([1])
  })

  it('does not throw when the whole batch fails', async () => {
    claimRows = [row(1, PRODUCT_A)]
    const result = await drainSearchOutbox({ run: vi.fn().mockRejectedValue(new Error('down')) })
    expect(result).toMatchObject({ claimed: 1, indexed: 0, failed: 1 })
    expect(callsTo('fn_complete_search_outbox')).toHaveLength(0)
  })

  it('caps the error text it hands back to Postgres', async () => {
    claimRows = [row(1, PRODUCT_A)]
    await drainSearchOutbox({ run: vi.fn().mockRejectedValue(new Error('x'.repeat(4000))) })
    expect(String(callsTo('fn_fail_search_outbox')[0]?.args.p_error).length).toBeLessThanOrEqual(
      500,
    )
  })

  it('THROWS when the claim itself fails, because nothing is in flight', async () => {
    claimError = { message: 'permission denied' }
    await expect(drainSearchOutbox({ run: vi.fn() })).rejects.toThrow('permission denied')
  })

  it('throws rather than guessing when the claim returns an unrecognised shape', async () => {
    claimRows = [{ id: 1, op: 'sideways' }]
    await expect(drainSearchOutbox({ run: vi.fn() })).rejects.toThrow(/unrecognised shape/)
  })

  it('swallows a failed completion: the documents are already indexed', async () => {
    // Re-indexing them on the next drain is a no-op. Throwing here would turn
    // a successful batch into a 500 and make the scheduler retry all of it.
    claimRows = [row(1, PRODUCT_A)]
    completeError = { message: 'statement timeout' }
    const result = await drainSearchOutbox({ run: vi.fn().mockResolvedValue('ok') })
    expect(result).toMatchObject({ indexed: 1, failed: 0 })
  })

  it('passes the batch limit through to the claim', async () => {
    await drainSearchOutbox({ limit: 7, run: vi.fn() })
    expect(callsTo('fn_claim_search_outbox')[0]?.args.p_limit).toBe(7)
  })
})
