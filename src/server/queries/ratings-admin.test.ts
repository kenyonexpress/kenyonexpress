import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  LOW_RATING_MAX,
  parseDays,
  parseRatingFilter,
  readRatingsOverview,
  readRatingsTile,
  summarizeRatings,
  windowStart,
} from './ratings-admin'

/**
 * The owner's ratings view (STEP 45). The pure half is proven directly; the
 * read half is proven against a recording client: that both tables are read
 * through the client it is handed (the service role, by the caller's
 * choice), that the window lands in SQL and the rating filter in memory,
 * that the summary describes the window and not the filter, and that a
 * missing table is `available: false` with no log line.
 */

const logWarn = vi.hoisted(() => vi.fn())
vi.mock('@/lib/observability/log', () => ({
  log: { warn: logWarn, info: vi.fn(), error: vi.fn() },
}))

type Result = { data: unknown; error: { code?: string } | null; count?: number | null }
type Call = { table: string; chain: [string, unknown[]][] }

const calls: Call[] = []
const results = new Map<string, Result>()

function fakeAdmin() {
  return {
    from(table: string) {
      const record: Call = { table, chain: [] }
      calls.push(record)
      const proxy: unknown = new Proxy(
        {},
        {
          get(_t, prop) {
            if (prop === 'then') {
              return (resolve: (v: Result) => unknown, reject?: (e: unknown) => unknown) =>
                Promise.resolve(results.get(table) ?? { data: [], error: null }).then(
                  resolve,
                  reject,
                )
            }
            return (...args: unknown[]) => {
              record.chain.push([String(prop), args])
              return proxy
            }
          },
        },
      )
      return proxy
    },
  } as never
}

const FEEDBACK_ROWS = [
  {
    id: 'f1',
    order_id: 'o1',
    rating: 5,
    body: 'מעולה',
    created_at: '2026-10-07T10:00:00.000Z',
    order: { id: 'o1', created_at: '2026-10-01T10:00:00.000Z', status: 'fulfilled' },
    profile: { full_name: 'דנה', email: 'dana@example.com' },
  },
  {
    id: 'f2',
    order_id: 'o2',
    rating: 2,
    body: null,
    created_at: '2026-10-06T10:00:00.000Z',
    order: null,
    profile: null,
  },
  {
    id: 'f3',
    order_id: 'o3',
    rating: 4,
    body: 'בסדר',
    created_at: '2026-10-05T10:00:00.000Z',
    order: { id: 'o3', created_at: '2026-10-02T10:00:00.000Z', status: 'paid' },
    profile: { full_name: null, email: 'x@example.com' },
  },
]

const REVIEW_ROWS = [
  {
    id: 'r1',
    product_id: 'p1',
    rating: 1,
    body: 'לא הגיע',
    status: 'pending',
    created_at: '2026-10-07T09:00:00.000Z',
    product: { name_he: 'עיסוי', slug: 'massage' },
    profile: { full_name: 'יוסי', email: 'y@example.com' },
  },
  {
    id: 'r2',
    product_id: 'p2',
    rating: 5,
    body: null,
    status: 'approved',
    created_at: '2026-10-04T09:00:00.000Z',
    product: null,
    profile: null,
  },
]

beforeEach(() => {
  calls.length = 0
  results.clear()
  logWarn.mockClear()
})

describe('summarizeRatings', () => {
  it('counts, averages to one decimal, distributes and flags low scores', () => {
    const s = summarizeRatings([5, 2, 4, 5, 1])
    expect(s.count).toBe(5)
    expect(s.average).toBe(3.4)
    expect(s.distribution).toEqual({ 1: 1, 2: 1, 3: 0, 4: 1, 5: 2 })
    expect(s.low).toBe(2)
    expect(LOW_RATING_MAX).toBe(2)
  })

  it('answers null, not NaN, for nothing to average', () => {
    expect(summarizeRatings([])).toEqual({
      count: 0,
      average: null,
      distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      low: 0,
    })
  })

  it('drops a score outside 1..5 instead of averaging it in', () => {
    expect(summarizeRatings([5, 0, 9, Number.NaN]).count).toBe(1)
  })
})

describe('the query-string readers', () => {
  it('reads the four windows and defaults to 30', () => {
    expect(parseDays('7')).toBe(7)
    expect(parseDays('90')).toBe(90)
    expect(parseDays('all')).toBe(0)
    expect(parseDays('13')).toBe(30)
    expect(parseDays(undefined)).toBe(30)
    expect(parseDays(['7', '30'])).toBe(7)
  })

  it('reads low and a single score, else all', () => {
    expect(parseRatingFilter('low')).toBe('low')
    expect(parseRatingFilter('3')).toBe(3)
    expect(parseRatingFilter('6')).toBe('all')
    expect(parseRatingFilter(undefined)).toBe('all')
  })

  it('computes the window start from the clock it is given', () => {
    const now = new Date('2026-10-08T12:00:00.000Z')
    expect(windowStart(7, now)).toBe('2026-10-01T12:00:00.000Z')
    expect(windowStart(0, now)).toBeNull()
    expect(windowStart(undefined, now)).toBeNull()
  })
})

describe('readRatingsOverview', () => {
  it('reads both tables through the client it is handed, windowed in SQL', async () => {
    results.set('order_feedback', { data: FEEDBACK_ROWS, error: null })
    results.set('reviews', { data: REVIEW_ROWS, error: null })

    const overview = await readRatingsOverview(fakeAdmin(), { days: 30 })

    expect(calls.map((c) => c.table).sort()).toEqual(['order_feedback', 'reviews'])
    for (const call of calls) {
      const gte = call.chain.find(([op]) => op === 'gte')
      expect(gte?.[1][0]).toBe('created_at')
      expect(typeof gte?.[1][1]).toBe('string')
    }
    const reviewsCall = calls.find((c) => c.table === 'reviews')
    expect(reviewsCall?.chain).toContainEqual(['is', ['deleted_at', null]])

    expect(overview.since).not.toBeNull()
    expect(overview.feedback.available).toBe(true)
    expect(overview.feedback.summary).toEqual({
      count: 3,
      average: 3.7,
      distribution: { 1: 0, 2: 1, 3: 0, 4: 1, 5: 1 },
      low: 1,
    })
    expect(overview.feedback.entries[0]).toEqual({
      id: 'f1',
      orderId: 'o1',
      rating: 5,
      body: 'מעולה',
      createdAt: '2026-10-07T10:00:00.000Z',
      orderCreatedAt: '2026-10-01T10:00:00.000Z',
      orderStatus: 'fulfilled',
      customerName: 'דנה',
      customerEmail: 'dana@example.com',
    })
    expect(overview.reviews.pending).toBe(1)
    expect(overview.reviews.entries[1]).toMatchObject({
      productName: null,
      productSlug: null,
      customerName: null,
    })
  })

  it('skips the window clause for all time', async () => {
    await readRatingsOverview(fakeAdmin(), { days: 0 })
    for (const call of calls) {
      expect(call.chain.find(([op]) => op === 'gte')).toBeUndefined()
    }
  })

  it('filters the lists in memory and leaves the summary describing the window', async () => {
    results.set('order_feedback', { data: FEEDBACK_ROWS, error: null })
    results.set('reviews', { data: REVIEW_ROWS, error: null })

    const low = await readRatingsOverview(fakeAdmin(), { filter: 'low' })
    expect(low.feedback.entries.map((e) => e.id)).toEqual(['f2'])
    expect(low.reviews.entries.map((e) => e.id)).toEqual(['r1'])
    expect(low.feedback.summary.count).toBe(3)

    const fives = await readRatingsOverview(fakeAdmin(), { filter: 5 })
    expect(fives.feedback.entries.map((e) => e.id)).toEqual(['f1'])
    expect(fives.reviews.entries.map((e) => e.id)).toEqual(['r2'])
  })

  it('treats a missing table as unavailable, silently', async () => {
    results.set('order_feedback', { data: null, error: { code: 'PGRST205' } })
    results.set('reviews', { data: REVIEW_ROWS, error: null })

    const overview = await readRatingsOverview(fakeAdmin())
    expect(overview.feedback.available).toBe(false)
    expect(overview.feedback.summary.count).toBe(0)
    expect(overview.reviews.available).toBe(true)
    expect(logWarn).not.toHaveBeenCalled()
  })

  it('logs any other read failure and still answers', async () => {
    results.set('order_feedback', { data: null, error: { code: '42501' } })
    const overview = await readRatingsOverview(fakeAdmin())
    expect(overview.feedback.available).toBe(false)
    expect(logWarn).toHaveBeenCalledWith('ratings_admin.feedback_read_failed', { code: '42501' })
  })
})

describe('readRatingsTile', () => {
  it('summarises the window and counts pending reviews', async () => {
    results.set('order_feedback', {
      data: [{ rating: 5 }, { rating: 1 }, { rating: 4 }],
      error: null,
    })
    results.set('reviews', { data: null, error: null, count: 2 })

    const tile = await readRatingsTile(fakeAdmin(), 30)
    expect(tile).toEqual({ available: true, count: 3, average: 3.3, low: 1, pendingReviews: 2 })
    const reviewsCall = calls.find((c) => c.table === 'reviews')
    expect(reviewsCall?.chain).toContainEqual(['eq', ['status', 'pending']])
  })

  it('is unavailable without the table and never throws', async () => {
    results.set('order_feedback', { data: null, error: { code: 'PGRST205' } })
    const tile = await readRatingsTile(fakeAdmin())
    expect(tile.available).toBe(false)
    expect(tile.average).toBeNull()
    expect(logWarn).not.toHaveBeenCalled()
  })
})
