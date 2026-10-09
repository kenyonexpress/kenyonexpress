import type { SearchIndexJob } from '@/lib/search/pipeline-contracts'
import type { OutboxJobRow } from '@/lib/supabase/pending-outbox'
import { describe, expect, it } from 'vitest'
import { OUTBOX_BATCH, type OutboxClient, backoffMinutes, drainSearchOutbox } from './outbox-drain'

const NOW = new Date('2026-09-09T12:00:00.000Z')

function row(overrides: Partial<OutboxJobRow>): OutboxJobRow {
  return {
    id: 1,
    product_id: 'a4f1c2e0-0000-4000-8000-000000000001',
    op: 'upsert',
    enqueued_at: '2026-09-08T03:00:00.000Z',
    claimed_at: NOW.toISOString(),
    done_at: null,
    attempts: 1,
    last_error: null,
    next_try_at: null,
    ...overrides,
  }
}

/** Fake client: records the claim args and every stamp written back. */
function fakeClient(claimed: OutboxJobRow[], stampError: { message: string } | null = null) {
  const stamps: { values: Record<string, unknown>; ids: number[] }[] = []
  let claimArgs: unknown
  const client: OutboxClient = {
    rpc: (_fn, args) => {
      claimArgs = args
      return Promise.resolve({ data: claimed, error: null })
    },
    from: () => ({
      update: (values: never) => ({
        in: (_column: string, ids: number[]) => {
          stamps.push({ values: values as Record<string, unknown>, ids })
          return Promise.resolve({ error: stampError })
        },
      }),
    }),
  }
  return { client, stamps, claimArgs: () => claimArgs }
}

describe('backoffMinutes', () => {
  it('doubles from two minutes and caps at six hours', () => {
    expect(backoffMinutes(1)).toBe(2)
    expect(backoffMinutes(3)).toBe(8)
    expect(backoffMinutes(20)).toBe(360)
  })

  it('never returns a zero wait, even for an impossible attempt count', () => {
    // attempts is incremented by the claim, so 0 should not occur; a bug there
    // must not turn into a hot retry loop here.
    expect(backoffMinutes(0)).toBe(2)
  })
})

describe('drainSearchOutbox', () => {
  it('claims a batch and stamps every successful row done', async () => {
    const { client, stamps, claimArgs } = fakeClient([row({ id: 1 }), row({ id: 2, op: 'delete' })])
    const ran: SearchIndexJob[] = []

    const summary = await drainSearchOutbox(
      client,
      async (job) => {
        ran.push(job)
        return 'ok'
      },
      NOW,
    )

    expect(claimArgs()).toEqual({ p_limit: OUTBOX_BATCH })
    // Two rows, one product: one job runs, both rows are settled by it.
    expect(ran).toHaveLength(1)
    expect(summary).toMatchObject({ claimed: 2, succeeded: 1, failed: 0 })
    expect(stamps).toHaveLength(1)
    expect(stamps[0]?.ids.sort()).toEqual([1, 2])
    expect(stamps[0]?.values).toEqual({ done_at: NOW.toISOString() })
  })

  it('runs the NEWEST row’s op for a product, not the oldest', () => {
    // upsert enqueued at 03:00, delete at 04:00: the product was removed after
    // the edit, and the delete is the current truth.
    const { client } = fakeClient([
      row({ id: 1, op: 'upsert', enqueued_at: '2026-09-08T03:00:00.000Z' }),
      row({ id: 2, op: 'delete', enqueued_at: '2026-09-08T04:00:00.000Z' }),
    ])
    const ops: string[] = []
    return drainSearchOutbox(
      client,
      async (job) => {
        ops.push(job.op)
        return 'ok'
      },
      NOW,
    ).then(() => expect(ops).toEqual(['delete']))
  })

  it('stamps a failed product with the error and an exponential backoff', async () => {
    const { client, stamps } = fakeClient([row({ id: 7, attempts: 3 })])

    const summary = await drainSearchOutbox(
      client,
      async () => {
        throw new Error('meilisearch PUT -> 503')
      },
      NOW,
    )

    expect(summary).toMatchObject({ claimed: 1, succeeded: 0, failed: 1 })
    expect(summary.errors[0]).toContain('503')
    // attempts=3 -> 8 minutes.
    expect(stamps[0]?.values).toEqual({
      last_error: 'meilisearch PUT -> 503',
      next_try_at: new Date(NOW.getTime() + 8 * 60_000).toISOString(),
    })
  })

  it('lets one product fail without taking the batch down', async () => {
    const bad = 'a4f1c2e0-0000-4000-8000-00000000bad1'
    const { client, stamps } = fakeClient([row({ id: 1 }), row({ id: 2, product_id: bad })])

    const summary = await drainSearchOutbox(
      client,
      async (job) => {
        if (job.productId === bad) throw new Error('boom')
        return 'ok'
      },
      NOW,
    )

    expect(summary).toMatchObject({ claimed: 2, succeeded: 1, failed: 1 })
    expect(stamps).toHaveLength(2)
  })

  it('reports a failed claim instead of throwing', async () => {
    const client: OutboxClient = {
      rpc: () => Promise.resolve({ data: null, error: { message: 'relation does not exist' } }),
      from: () => {
        throw new Error('must not stamp anything on a failed claim')
      },
    }

    const summary = await drainSearchOutbox(client, async () => 'ok', NOW)
    expect(summary).toMatchObject({ claimed: 0, succeeded: 0, failed: 0 })
    expect(summary.errors[0]).toContain('relation does not exist')
  })

  it('surfaces a failed stamp loudly rather than looping silently', async () => {
    const { client } = fakeClient([row({ id: 1 })], { message: 'permission denied' })
    const summary = await drainSearchOutbox(client, async () => 'ok', NOW)
    // The job itself succeeded; the stamp failure is the alarm.
    expect(summary.succeeded).toBe(1)
    expect(summary.errors.some((e) => e.includes('permission denied'))).toBe(true)
  })
})
