import {
  DLQ_BATCH_LIMIT,
  listDeadLetters,
  markProcessed,
  replayDeadLetters,
} from '@/server/payments/webhook-dlq'
import { describe, expect, it, vi } from 'vitest'

/**
 * The queue is a query, not a table, so the thing worth testing is the filter.
 * A wrong predicate here either hides charged-but-unclosed orders (the bug this
 * replaces) or replays finalize against events that already closed.
 */

type Row = Record<string, unknown>

function client(rows: Row[]) {
  const calls: Record<string, unknown> = {}
  const updates: Array<{ values: Row; eq: Record<string, unknown> }> = []

  const selectBuilder = () => {
    const eqs: Record<string, unknown> = {}
    const builder: Record<string, unknown> = {}
    const chain = {
      select: () => builder,
      eq: (col: string, value: unknown) => {
        eqs[col] = value
        calls.eq = eqs
        return builder
      },
      is: (col: string, value: unknown) => {
        eqs[`is:${col}`] = value
        calls.eq = eqs
        return builder
      },
      order: (col: string, opts: unknown) => {
        calls.order = { col, opts }
        return builder
      },
      limit: (n: number) => {
        calls.limit = n
        return Promise.resolve({ data: rows, error: null })
      },
      update: (values: Row) => {
        const ueqs: Record<string, unknown> = {}
        const ubuilder = {
          eq: (col: string, value: unknown) => {
            ueqs[col] = value
            updates.push({ values, eq: ueqs })
            return Promise.resolve({ error: null })
          },
        }
        return ubuilder
      },
    }
    Object.assign(builder, chain)
    return builder
  }

  return {
    admin: { from: () => selectBuilder() } as never,
    calls,
    updates,
  }
}

const row = (over: Row = {}): Row => ({
  id: 'ev-1',
  external_event_id: 'lp-1:deal-1',
  payment_id: 'pay-1',
  created_at: '2026-07-31T10:00:00Z',
  ...over,
})

describe('listDeadLetters', () => {
  it('asks only for verified events that never reached processed_at', async () => {
    const { admin, calls } = client([row()])
    await listDeadLetters(admin)

    expect(calls.eq).toMatchObject({
      provider: 'cardcom',
      verified_against_api: true,
      'is:processed_at': null,
    })
  })

  it('takes the oldest first, since that customer has waited longest', async () => {
    const { admin, calls } = client([row()])
    await listDeadLetters(admin)
    expect(calls.order).toEqual({ col: 'created_at', opts: { ascending: true } })
  })

  it('bounds the sweep', async () => {
    const { admin, calls } = client([row()])
    await listDeadLetters(admin)
    expect(calls.limit).toBe(DLQ_BATCH_LIMIT)
  })

  it('maps a row onto the shape callers use', async () => {
    const { admin } = client([row()])
    const [letter] = await listDeadLetters(admin)
    expect(letter).toEqual({
      id: 'ev-1',
      externalEventId: 'lp-1:deal-1',
      paymentId: 'pay-1',
      createdAt: '2026-07-31T10:00:00Z',
    })
  })

  it('reports a null payment_id as null rather than the string "null"', async () => {
    const { admin } = client([row({ payment_id: null })])
    const [letter] = await listDeadLetters(admin)
    expect(letter?.paymentId).toBeNull()
  })
})

describe('markProcessed', () => {
  it('stamps by row id, not by event id', async () => {
    const { admin, updates } = client([])
    await markProcessed(admin, 'ev-9', new Date('2026-07-31T12:00:00Z'))

    expect(updates).toHaveLength(1)
    expect(updates[0]?.eq).toEqual({ id: 'ev-9' })
    expect(updates[0]?.values).toEqual({ processed_at: '2026-07-31T12:00:00.000Z' })
  })
})

describe('replayDeadLetters', () => {
  it('finalizes each event and stamps the ones that close', async () => {
    const { admin, updates } = client([row()])
    const finalize = vi.fn().mockResolvedValue({ ok: true })

    const results = await replayDeadLetters(admin, finalize)

    expect(finalize).toHaveBeenCalledWith('pay-1')
    expect(results[0]?.ok).toBe(true)
    expect(updates).toHaveLength(1)
  })

  it('leaves a failed replay in the queue so it comes back', async () => {
    const { admin, updates } = client([row()])
    const finalize = vi.fn().mockResolvedValue({ ok: false, error: 'order locked' })

    const results = await replayDeadLetters(admin, finalize)

    expect(results[0]).toMatchObject({ ok: false, error: 'order locked' })
    // Nothing stamped: the money is still stranded.
    expect(updates).toHaveLength(0)
  })

  it('survives a finalize that throws, because the rest is other people money', async () => {
    const { admin, updates } = client([row()])
    const finalize = vi.fn().mockRejectedValue(new Error('connection reset'))

    const results = await replayDeadLetters(admin, finalize)

    expect(results[0]).toMatchObject({ ok: false, error: 'connection reset' })
    expect(updates).toHaveLength(0)
  })

  it('refuses an event with no payment_id instead of guessing one', async () => {
    const { admin, updates } = client([row({ payment_id: null })])
    const finalize = vi.fn()

    const results = await replayDeadLetters(admin, finalize)

    expect(finalize).not.toHaveBeenCalled()
    expect(results[0]?.ok).toBe(false)
    expect(results[0]?.error).toMatch(/no payment_id/)
    // Stays in the queue: it needs a human, and hiding it would lose it.
    expect(updates).toHaveLength(0)
  })

  it('returns an empty report when the queue is clear', async () => {
    const { admin } = client([])
    expect(await replayDeadLetters(admin, vi.fn())).toEqual([])
  })
})
