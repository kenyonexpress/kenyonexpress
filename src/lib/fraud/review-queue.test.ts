import { beforeEach, describe, expect, it, vi } from 'vitest'
import { enqueueFraudReview, hasBlockingFraudFlag } from './review-queue'

const logError = vi.fn()
const logWarn = vi.fn()
vi.mock('@/lib/observability/log', () => ({
  log: {
    error: (...args: unknown[]) => logError(...args),
    warn: (...args: unknown[]) => logWarn(...args),
  },
}))

/**
 * Same chainable then-able stand-in the checkout test uses, one result per
 * table+op key.
 */
type Result = { data: unknown; error: unknown }
const results = new Map<string, Result>()
const inserts: { table: string; payload: unknown }[] = []

function builder(table: string, op: string): unknown {
  const key = `${table}.${op}`
  const settle = () => results.get(key) ?? { data: null, error: null }
  const proxy: unknown = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === 'then') {
          return (resolve: (v: Result) => unknown, reject?: (e: unknown) => unknown) =>
            Promise.resolve(settle()).then(resolve, reject)
        }
        return () => {
          if (prop === 'maybeSingle' || prop === 'single') return Promise.resolve(settle())
          return proxy
        }
      },
    },
  )
  return proxy
}

const admin = {
  from: (table: string) => ({
    select: () => builder(table, 'select'),
    insert: (payload: unknown) => {
      inserts.push({ table, payload })
      return builder(table, 'insert')
    },
  }),
} as never

beforeEach(() => {
  results.clear()
  inserts.length = 0
  logError.mockClear()
  logWarn.mockClear()
})

describe('enqueueFraudReview', () => {
  const item = { userId: 'u-1', orderId: 'o-1', kind: 'velocity' as const, details: { d: 'ip' } }

  it('writes the row with the queue shape', async () => {
    await enqueueFraudReview(admin, item)
    expect(inserts).toEqual([
      {
        table: 'fraud_review_queue',
        payload: { user_id: 'u-1', order_id: 'o-1', kind: 'velocity', details: { d: 'ip' } },
      },
    ])
    expect(logError).not.toHaveBeenCalled()
  })

  it('treats the pending-dedupe collision as success, silently', async () => {
    results.set('fraud_review_queue.insert', {
      data: null,
      error: { code: '23505', message: 'dup' },
    })
    await enqueueFraudReview(admin, item)
    expect(logError).not.toHaveBeenCalled()
    expect(logWarn).not.toHaveBeenCalled()
  })

  it('warns and swallows when the table is not migrated yet', async () => {
    results.set('fraud_review_queue.insert', {
      data: null,
      error: { code: '42P01', message: 'no rel' },
    })
    await expect(enqueueFraudReview(admin, item)).resolves.toBeUndefined()
    expect(logWarn).toHaveBeenCalledWith('fraud.queue_table_missing', { kind: 'velocity' })
  })

  it('logs any other failure and never throws: the fraud rail must not kill a sale', async () => {
    results.set('fraud_review_queue.insert', {
      data: null,
      error: { code: 'XX000', message: 'boom' },
    })
    await expect(enqueueFraudReview(admin, item)).resolves.toBeUndefined()
    expect(logError).toHaveBeenCalledWith('fraud.enqueue_failed', {
      kind: 'velocity',
      reason: 'boom',
    })
  })

  it('survives a client that throws outright', async () => {
    const broken = {
      from: () => {
        throw new Error('offline')
      },
    } as never
    await expect(enqueueFraudReview(broken, item)).resolves.toBeUndefined()
    expect(logError).toHaveBeenCalled()
  })
})

describe('hasBlockingFraudFlag', () => {
  it('is true when an uncleared chargeback or manual flag exists', async () => {
    results.set('fraud_flags.select', { data: { id: 'f-1' }, error: null })
    await expect(hasBlockingFraudFlag(admin, 'u-1')).resolves.toBe(true)
  })

  it('is false for a clean customer', async () => {
    results.set('fraud_flags.select', { data: null, error: null })
    await expect(hasBlockingFraudFlag(admin, 'u-1')).resolves.toBe(false)
  })

  it('fails open on a read error, and loudly', async () => {
    results.set('fraud_flags.select', { data: null, error: { code: 'XX000', message: 'boom' } })
    await expect(hasBlockingFraudFlag(admin, 'u-1')).resolves.toBe(false)
    expect(logError).toHaveBeenCalledWith('fraud.flag_read_failed', { reason: 'boom' })
  })

  it('fails open quietly when the table is not migrated yet', async () => {
    results.set('fraud_flags.select', { data: null, error: { code: '42P01', message: 'no rel' } })
    await expect(hasBlockingFraudFlag(admin, 'u-1')).resolves.toBe(false)
    expect(logError).not.toHaveBeenCalled()
  })
})
