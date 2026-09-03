import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { runSearchIndexJob } = vi.hoisted(() => ({ runSearchIndexJob: vi.fn() }))
vi.mock('@/lib/search/indexer', () => ({ runSearchIndexJob }))

import { BACKOFF_CAP_MINUTES, drainSearchOutbox, searchBackoffMinutes } from './outbox-drain'

/**
 * The outbox floor's consumer (marathon step 9). 132 built the claim and the
 * eligibility index; this proves the drain half: failures back off on the
 * ladder instead of hot-looping, one bad job cannot abort the batch, and an
 * unconfigured deploy claims NOTHING (claiming would mark rows done that no
 * index ever heard about).
 */

type Update = { id: number; patch: Record<string, unknown> }

function adminMock(jobs: unknown[], rpcError: { message: string } | null = null) {
  const updates: Update[] = []
  const rpc = vi.fn().mockResolvedValue({ data: jobs, error: rpcError })
  const admin = {
    rpc,
    from: () => ({
      update: (patch: Record<string, unknown>) => ({
        eq: (_col: string, id: number) => {
          updates.push({ id, patch })
          return Promise.resolve({ error: null })
        },
      }),
    }),
  } as never
  return { admin, rpc, updates }
}

const JOB = (id: number, attempts = 1, op = 'upsert') => ({
  id,
  product_id: `p-${id}`,
  op,
  attempts,
})

beforeEach(() => {
  runSearchIndexJob.mockReset()
  runSearchIndexJob.mockResolvedValue('ok')
  vi.stubEnv('MEILISEARCH_HOST', 'http://meili.test')
  vi.stubEnv('MEILISEARCH_API_KEY', 'mk')
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('the backoff ladder', () => {
  it('walks 2, 8, 32, 128, 512 and stays at the cap forever', () => {
    expect([1, 2, 3, 4, 5, 6, 20].map(searchBackoffMinutes)).toEqual([
      2,
      8,
      32,
      128,
      BACKOFF_CAP_MINUTES,
      BACKOFF_CAP_MINUTES,
      BACKOFF_CAP_MINUTES,
    ])
  })
})

describe('drainSearchOutbox', () => {
  it('claims nothing at all while Meilisearch is unconfigured', async () => {
    vi.stubEnv('MEILISEARCH_HOST', '')
    const { admin, rpc } = adminMock([JOB(1)])
    expect(await drainSearchOutbox(admin)).toEqual({ claimed: 0, done: 0, failed: 0 })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('runs each claimed job through the same executor the webhook uses and marks it done', async () => {
    const { admin, rpc, updates } = adminMock([JOB(1), JOB(2, 1, 'delete')])
    const result = await drainSearchOutbox(admin, 10)
    expect(result).toEqual({ claimed: 2, done: 2, failed: 0 })
    expect(rpc).toHaveBeenCalledWith('claim_search_index_jobs', { p_limit: 10 })
    expect(runSearchIndexJob).toHaveBeenCalledWith({ op: 'upsert', productId: 'p-1' })
    expect(runSearchIndexJob).toHaveBeenCalledWith({ op: 'delete', productId: 'p-2' })
    expect(updates.map((u) => u.id)).toEqual([1, 2])
    for (const u of updates) expect(u.patch.done_at).toBeTypeOf('string')
  })

  it('backs a failed job off on the ladder and keeps draining the rest', async () => {
    runSearchIndexJob
      .mockRejectedValueOnce(new Error('meilisearch down'))
      .mockResolvedValueOnce('ok')
    // attempts=3 (the claim already counted this attempt): next wait is 32min.
    const { admin, updates } = adminMock([JOB(1, 3), JOB(2)])
    const before = Date.now()
    const result = await drainSearchOutbox(admin)
    expect(result).toEqual({ claimed: 2, done: 1, failed: 1 })

    const failed = updates.find((u) => u.id === 1)
    expect(failed?.patch.last_error).toBe('meilisearch down')
    const nextTry = new Date(failed?.patch.next_try_at as string).getTime()
    expect(nextTry - before).toBeGreaterThanOrEqual(32 * 60_000 - 1000)
    expect(nextTry - before).toBeLessThanOrEqual(32 * 60_000 + 10_000)

    const done = updates.find((u) => u.id === 2)
    expect(done?.patch.done_at).toBeTypeOf('string')
  })

  it('throws when the claim itself fails, because that is the drain being down', async () => {
    const { admin } = adminMock([], { message: 'permission denied' })
    await expect(drainSearchOutbox(admin)).rejects.toThrow(/claim failed: permission denied/)
  })
})
