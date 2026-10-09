import { describe, expect, it, vi } from 'vitest'
import {
  RESURRECT_ATTEMPTS,
  isTransientSendError,
  planResurrection,
  resurrectDeadEmails,
} from './outbox-retry'

/**
 * Which dead rows get a second chance. The two ways this goes wrong are
 * opposite: resurrecting a row that can never render (it burns attempts and
 * log lines forever) and NOT resurrecting one that died in a provider outage
 * (the customer never gets their voucher). Both are one regex away.
 */

const NOW = new Date('2026-09-17T12:00:00Z')

describe('isTransientSendError', () => {
  it.each(['http_500', 'http_502', 'http_503', 'http_429', 'network', 'fetch failed', 'ETIMEDOUT'])(
    "treats %s as the provider's moment, not the row's",
    (reason) => {
      expect(isTransientSendError(reason)).toBe(true)
    },
  )

  it.each([
    'http_400',
    'http_401',
    'http_403',
    'http_422',
    'no template for kind order_paid',
    '',
    null,
  ])('treats %s as permanent', (reason) => {
    expect(isTransientSendError(reason)).toBe(false)
  })
})

describe('planResurrection', () => {
  it('requeues the transient rows and counts the permanent ones', () => {
    const plan = planResurrection(
      [
        { id: 'a', kind: 'order_paid', last_error: 'http_503', created_at: '2026-09-16T00:00:00Z' },
        {
          id: 'b',
          kind: 'order_paid',
          last_error: 'no template for kind x',
          created_at: '2026-09-16T00:00:00Z',
        },
        { id: 'c', kind: 'order_paid', last_error: 'network', created_at: '2026-09-17T00:00:00Z' },
      ],
      NOW,
    )
    expect(plan).toEqual({ requeue: ['a', 'c'], permanent: 1 })
  })

  it('ignores a row older than the window even when its error was transient', () => {
    const plan = planResurrection(
      [{ id: 'old', kind: 'x', last_error: 'http_503', created_at: '2026-09-10T00:00:00Z' }],
      NOW,
    )
    expect(plan).toEqual({ requeue: [], permanent: 0 })
  })
})

function stubAdmin(read: { data?: unknown; error?: unknown }, write: { error?: unknown } = {}) {
  const updates: { payload: unknown; ids?: string[] }[] = []
  const admin = {
    from: () => {
      let pending: { payload: unknown; ids?: string[] } | null = null
      const c: Record<string, unknown> = {}
      let result = read
      for (const m of ['select', 'eq', 'gte', 'order', 'limit']) c[m] = () => c
      c.update = (payload: unknown) => {
        pending = { payload }
        updates.push(pending)
        result = write
        return c
      }
      c.in = (_column: string, ids: string[]) => {
        if (pending) pending.ids = ids
        return c
      }
      // biome-ignore lint/suspicious/noThenProperty: the Supabase query builder IS a thenable; the stub must be awaitable like the real one
      c.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
        Promise.resolve({ data: result.data ?? null, error: result.error ?? null }).then(
          resolve,
          reject,
        )
      return c
    },
  }
  return { admin: admin as never, updates }
}

describe('resurrectDeadEmails', () => {
  it('puts the eligible rows back as pending with two tries left, keeping last_error', async () => {
    const { admin, updates } = stubAdmin({
      data: [
        { id: 'a', kind: 'k', last_error: 'http_503', created_at: '2026-09-16T00:00:00Z' },
        { id: 'b', kind: 'k', last_error: 'http_400', created_at: '2026-09-16T00:00:00Z' },
      ],
    })
    const summary = await resurrectDeadEmails(admin, NOW)
    expect(summary).toEqual({ scanned: 2, requeued: 1, permanent: 1 })
    expect(updates).toEqual([
      {
        payload: {
          status: 'pending',
          attempts: RESURRECT_ATTEMPTS,
          next_attempt_at: NOW.toISOString(),
        },
        ids: ['a'],
      },
    ])
    expect(RESURRECT_ATTEMPTS).toBe(3)
  })

  it('writes nothing when nothing qualifies', async () => {
    const { admin, updates } = stubAdmin({ data: [] })
    expect(await resurrectDeadEmails(admin, NOW)).toEqual({ scanned: 0, requeued: 0, permanent: 0 })
    expect(updates).toEqual([])
  })

  it('throws on a failed read so the route answers 500', async () => {
    const { admin } = stubAdmin({ error: { message: 'boom' } })
    await expect(resurrectDeadEmails(admin, NOW)).rejects.toThrow(/boom/)
  })

  it('throws on a failed write', async () => {
    const { admin } = stubAdmin(
      { data: [{ id: 'a', kind: 'k', last_error: 'network', created_at: '2026-09-16T00:00:00Z' }] },
      { error: { message: 'write refused' } },
    )
    await expect(resurrectDeadEmails(admin, NOW)).rejects.toThrow(/write refused/)
  })
})

vi.mock('@/lib/observability/log', () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))
