import {
  type AttemptLedger,
  DLQ_BACKOFF_MINUTES,
  DLQ_BATCH_LIMIT,
  type DeadLetter,
  MAX_DLQ_ATTEMPTS,
  classifyDeadLetter,
  forceReplayDeadLetter,
  isExhausted,
  listDeadLetters,
  markProcessed,
  nextAttemptAt,
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
      // Zero rather than absent: with no ledger supplied there is no history to
      // read, and a caller that renders `attempts` must not print `undefined`
      // for the commonest case.
      attempts: 0,
      lastAttemptAt: null,
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

/**
 * The backoff and the ceiling, which are the parts that decide whether a
 * charged customer is retried or abandoned.
 *
 * These are worth testing separately from the query above because they are pure
 * arithmetic over an attempt count that lives in a DIFFERENT table. Getting the
 * key or the clock wrong there does not fail loudly; it produces a queue that
 * either hammers one broken row forever or retires a recoverable one on its
 * first bad minute.
 */

const letter = (over: Partial<DeadLetter> = {}): DeadLetter => ({
  id: 'ev-1',
  externalEventId: 'lp-1:deal-1',
  paymentId: 'pay-1',
  createdAt: '2026-07-31T10:00:00Z',
  attempts: 0,
  lastAttemptAt: null,
  ...over,
})

/** A ledger that answers from a fixed map and records what it was asked to. */
function fakeLedger(history: Record<string, { attempts: number; lastAttemptAt: string | null }>) {
  const recorded: DeadLetter[] = []
  const ledger: AttemptLedger = {
    read: async (paymentIds) =>
      new Map(
        paymentIds
          .filter((id) => history[id] != null)
          .map((id) => [id, history[id] as { attempts: number; lastAttemptAt: string | null }]),
      ),
    record: async (l) => {
      recorded.push(l)
    },
  }
  return { ledger, recorded }
}

describe('nextAttemptAt', () => {
  it('makes the first attempt immediate, because the cheap retry usually works', () => {
    expect(nextAttemptAt(letter({ attempts: 0 }))).toEqual(new Date('2026-07-31T10:00:00Z'))
  })

  it('measures the wait from the last attempt, not from when the event was queued', () => {
    // The distinction that makes the backoff real. Measured from `created_at`,
    // a letter that has sat overnight would be past every window at once and
    // would burn all five attempts in five consecutive sweeps.
    const due = nextAttemptAt(
      letter({
        attempts: 1,
        lastAttemptAt: '2026-08-01T09:00:00Z',
        createdAt: '2026-07-31T10:00:00Z',
      }),
    )
    expect(due).toEqual(new Date('2026-08-01T09:05:00Z'))
  })

  it('widens the gap with each attempt', () => {
    const at = (attempts: number) =>
      nextAttemptAt(letter({ attempts, lastAttemptAt: '2026-08-01T09:00:00Z' })).getTime() -
      new Date('2026-08-01T09:00:00Z').getTime()

    expect(at(1)).toBe(DLQ_BACKOFF_MINUTES[1] * 60_000)
    expect(at(2)).toBe(DLQ_BACKOFF_MINUTES[2] * 60_000)
    expect(at(3)).toBe(DLQ_BACKOFF_MINUTES[3] * 60_000)
    expect(at(4)).toBe(DLQ_BACKOFF_MINUTES[4] * 60_000)
    expect(at(1)).toBeLessThan(at(4))
  })

  it('falls back to created_at when an attempt was counted with no timestamp', () => {
    expect(nextAttemptAt(letter({ attempts: 1, lastAttemptAt: null }))).toEqual(
      new Date('2026-07-31T10:05:00Z'),
    )
  })
})

describe('isExhausted', () => {
  it('is false right up to the ceiling and true at it', () => {
    expect(isExhausted(letter({ attempts: MAX_DLQ_ATTEMPTS - 1 }))).toBe(false)
    expect(isExhausted(letter({ attempts: MAX_DLQ_ATTEMPTS }))).toBe(true)
  })
})

describe('replayDeadLetters with a ledger', () => {
  const now = new Date('2026-08-01T09:02:00Z')

  it('does not touch an event inside its backoff window', async () => {
    const { admin, updates } = client([row()])
    const { ledger, recorded } = fakeLedger({
      'pay-1': { attempts: 1, lastAttemptAt: '2026-08-01T09:00:00Z' },
    })
    const finalize = vi.fn()

    const [result] = await replayDeadLetters(admin, finalize, { ledger, now })

    expect(result?.status).toBe('waiting')
    expect(finalize).not.toHaveBeenCalled()
    // Not an attempt: a row skipped for waiting must not consume one, or the
    // five attempts would be spent by the clock instead of by the retries.
    expect(recorded).toHaveLength(0)
    expect(updates).toHaveLength(0)
  })

  it('replays once the window has passed', async () => {
    const { admin } = client([row()])
    const { ledger, recorded } = fakeLedger({
      'pay-1': { attempts: 1, lastAttemptAt: '2026-08-01T08:00:00Z' },
    })
    const finalize = vi.fn().mockResolvedValue({ ok: true })

    const [result] = await replayDeadLetters(admin, finalize, { ledger, now })

    expect(result?.status).toBe('replayed')
    expect(finalize).toHaveBeenCalledWith('pay-1')
    expect(recorded).toHaveLength(1)
  })

  it('counts the attempt BEFORE running finalize, so a hang cannot loop forever', async () => {
    const { admin } = client([row()])
    const { ledger, recorded } = fakeLedger({})
    const order: string[] = []
    ledger.record = async () => {
      order.push('record')
      recorded.push(letter())
    }
    const finalize = vi.fn().mockImplementation(async () => {
      order.push('finalize')
      return { ok: false, error: 'still broken' }
    })

    await replayDeadLetters(admin, finalize, { ledger, now })

    expect(order).toEqual(['record', 'finalize'])
  })

  it('stops at the ceiling and says so rather than retrying forever', async () => {
    const { admin } = client([row()])
    const { ledger, recorded } = fakeLedger({
      'pay-1': { attempts: MAX_DLQ_ATTEMPTS, lastAttemptAt: '2026-07-01T00:00:00Z' },
    })
    const finalize = vi.fn()

    const [result] = await replayDeadLetters(admin, finalize, { ledger, now })

    expect(result?.status).toBe('exhausted')
    expect(result?.error).toMatch(new RegExp(`${MAX_DLQ_ATTEMPTS} attempts`))
    expect(finalize).not.toHaveBeenCalled()
    expect(recorded).toHaveLength(0)
  })

  it('force ignores both the window and the ceiling, which is what the button is for', async () => {
    const { admin } = client([row()])
    const { ledger } = fakeLedger({
      'pay-1': { attempts: MAX_DLQ_ATTEMPTS + 3, lastAttemptAt: '2026-08-01T09:01:00Z' },
    })
    const finalize = vi.fn().mockResolvedValue({ ok: true })

    const [result] = await replayDeadLetters(admin, finalize, { ledger, now, force: true })

    expect(result?.status).toBe('replayed')
    expect(finalize).toHaveBeenCalledWith('pay-1')
  })

  it('classifies an unlinkable event before it ever consults the backoff', async () => {
    const { admin } = client([row({ payment_id: null })])
    const { ledger, recorded } = fakeLedger({})

    const [result] = await replayDeadLetters(admin, vi.fn(), { ledger, now })

    expect(result?.status).toBe('unlinkable')
    expect(recorded).toHaveLength(0)
  })
})

describe('classifyDeadLetter', () => {
  const now = new Date('2026-08-01T09:02:00Z')

  it('agrees with the sweep on every verdict', () => {
    expect(
      classifyDeadLetter(letter({ paymentId: null }), { attempts: 0, lastAttemptAt: null }, now),
    ).toBe('unreplayable')
    expect(
      classifyDeadLetter(letter(), { attempts: MAX_DLQ_ATTEMPTS, lastAttemptAt: null }, now),
    ).toBe('stuck')
    expect(
      classifyDeadLetter(letter(), { attempts: 1, lastAttemptAt: '2026-08-01T09:00:00Z' }, now),
    ).toBe('waiting')
    expect(
      classifyDeadLetter(letter(), { attempts: 1, lastAttemptAt: '2026-08-01T08:00:00Z' }, now),
    ).toBe('due')
  })
})

/** A one-row client that supports the `maybeSingle` read `forceReplay` does. */
function singleClient(single: Row | null) {
  const updates: Array<{ values: Row; eq: Record<string, unknown> }> = []
  const builder: Record<string, unknown> = {}
  Object.assign(builder, {
    select: () => builder,
    eq: () => builder,
    in: () => Promise.resolve({ data: [], error: null }),
    maybeSingle: () => Promise.resolve({ data: single, error: null }),
    insert: () => Promise.resolve({ error: null }),
    update: (values: Row) => ({
      eq: (col: string, value: unknown) => {
        updates.push({ values, eq: { [col]: value } })
        return Promise.resolve({ error: null })
      },
    }),
  })
  return { admin: { from: () => builder } as never, updates }
}

describe('forceReplayDeadLetter', () => {
  const live = {
    id: 'ev-1',
    external_event_id: 'lp-1:deal-1',
    payment_id: 'pay-1',
    created_at: '2026-07-31T10:00:00Z',
    processed_at: null,
    verified_against_api: true,
  }

  it('closes the order and stamps the row', async () => {
    const { admin, updates } = singleClient(live)
    const finalize = vi.fn().mockResolvedValue({ ok: true })

    const outcome = await forceReplayDeadLetter(admin, 'ev-1', finalize, {
      id: 'admin-1',
      role: 'admin',
    })

    expect(outcome.ok).toBe(true)
    expect(finalize).toHaveBeenCalledWith('pay-1')
    expect(updates.some((u) => 'processed_at' in u.values)).toBe(true)
  })

  it('refuses a row that was already handled between render and click', async () => {
    // The race that matters: the sweep closed it, or a second operator did.
    // "Already handled" and "handled twice" must not read the same afterwards.
    const { admin, updates } = singleClient({ ...live, processed_at: '2026-08-01T09:00:00Z' })
    const finalize = vi.fn()

    const outcome = await forceReplayDeadLetter(admin, 'ev-1', finalize)

    expect(outcome.ok).toBe(false)
    expect(finalize).not.toHaveBeenCalled()
    expect(updates).toHaveLength(0)
  })

  it('refuses a row Cardcom never confirmed, because closing it would invent a payment', async () => {
    const { admin } = singleClient({ ...live, verified_against_api: false })
    const finalize = vi.fn()

    const outcome = await forceReplayDeadLetter(admin, 'ev-1', finalize)

    expect(outcome.ok).toBe(false)
    expect(finalize).not.toHaveBeenCalled()
  })

  it('refuses an event with no payment rather than guessing one', async () => {
    const { admin } = singleClient({ ...live, payment_id: null })
    const finalize = vi.fn()

    const outcome = await forceReplayDeadLetter(admin, 'ev-1', finalize)

    expect(outcome.ok).toBe(false)
    expect(finalize).not.toHaveBeenCalled()
  })

  it('reports a missing row instead of throwing at the operator', async () => {
    const { admin } = singleClient(null)
    expect((await forceReplayDeadLetter(admin, 'ev-1', vi.fn())).ok).toBe(false)
  })

  it('does not stamp a row whose finalize failed', async () => {
    const { admin, updates } = singleClient(live)
    const finalize = vi.fn().mockResolvedValue({ ok: false, error: 'order locked' })

    const outcome = await forceReplayDeadLetter(admin, 'ev-1', finalize)

    expect(outcome).toMatchObject({ ok: false, error: 'order locked' })
    expect(updates.some((u) => 'processed_at' in u.values)).toBe(false)
  })
})
