import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The nightly logical backup.
 *
 * WHAT IS ACTUALLY AT RISK HERE. The route holds three promises and each is
 * one condition away from silently inverted: it must be unreachable without
 * the secret (it hands out every order and profile as one JSON object on a
 * public URL), it must upload NOTHING unless every table read succeeded (a
 * backup missing `orders` looks complete and is worse than a red run), and it
 * must be idempotent per UTC day so two schedulers racing produce one object,
 * not a clobber. Truncation must be recorded, never silent — a capped table
 * that reads as complete is the same lie as a missing one.
 */

const createBucket = vi.fn()
const list = vi.fn()
const upload = vi.fn()
const limit = vi.fn()
const select = vi.fn(() => ({ limit }))
const from = vi.fn(() => ({ select }))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from,
    storage: {
      createBucket,
      from: () => ({ list, upload }),
    },
  }),
}))

import { GET } from './route'

function request(auth?: string): NextRequest {
  return new NextRequest('https://example.test/api/cron/backup', {
    headers: auth ? { authorization: auth } : {},
  })
}

describe('backup cron', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    createBucket.mockResolvedValue({ error: null })
    list.mockResolvedValue({ data: [], error: null })
    upload.mockResolvedValue({ error: null })
    limit.mockResolvedValue({ data: [{ id: 1 }], count: 1, error: null })
    vi.stubEnv('CRON_SECRET', 's3cret')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  describe('auth', () => {
    it('rejects a request with no credential', async () => {
      expect((await GET(request())).status).toBe(401)
      expect(from).not.toHaveBeenCalled()
    })

    it('rejects a wrong credential', async () => {
      expect((await GET(request('Bearer wrong'))).status).toBe(401)
      expect(from).not.toHaveBeenCalled()
    })

    it('stays closed when CRON_SECRET is unset rather than opening', async () => {
      vi.stubEnv('CRON_SECRET', '')
      expect((await GET(request('Bearer '))).status).toBe(401)
      expect(from).not.toHaveBeenCalled()
    })
  })

  describe('the happy path', () => {
    it('reads every declared table exactly once and uploads one object', async () => {
      const response = await GET(request('Bearer s3cret'))
      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body.ok).toBe(true)
      expect(body.truncated).toEqual([])
      // The money path must be inside the dump, not near it.
      for (const table of ['orders', 'order_items', 'payments', 'vouchers', 'wallet_entries']) {
        expect(from).toHaveBeenCalledWith(table)
        expect(body.counts[table]).toBe(1)
      }
      expect(from).toHaveBeenCalledTimes(Object.keys(body.counts).length)
      expect(upload).toHaveBeenCalledTimes(1)
    })

    it('uploads under the UTC date, as JSON, refusing to clobber', async () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-09-10T02:20:00Z'))
      try {
        await GET(request('Bearer s3cret'))
      } finally {
        vi.useRealTimers()
      }

      const [path, payload, options] = upload.mock.calls[0] ?? []
      expect(path).toBe('daily/2026-09-10.json')
      expect(options).toEqual({ contentType: 'application/json', upsert: false })
      const parsed = JSON.parse(payload as string)
      expect(parsed.day).toBe('2026-09-10')
      expect(parsed.tables.orders).toEqual({ rows: [{ id: 1 }], count: 1, truncated: false })
    })

    it('treats a bucket that already exists as the normal case', async () => {
      createBucket.mockResolvedValue({ error: { message: 'The resource already exists' } })
      expect((await GET(request('Bearer s3cret'))).status).toBe(200)
    })
  })

  describe('idempotency per day', () => {
    it('skips without reading anything when today is already backed up', async () => {
      list.mockResolvedValue({ data: [{ name: 'x.json' }], error: null })
      const body = await (await GET(request('Bearer s3cret'))).json()
      expect(body).toMatchObject({ ok: true, skipped: true })
      expect(from).not.toHaveBeenCalled()
      expect(upload).not.toHaveBeenCalled()
    })

    it('reports skipped, not failure, when another scheduler wins the race', async () => {
      upload.mockResolvedValue({ error: { message: 'The resource already exists' } })
      const response = await GET(request('Bearer s3cret'))
      expect(response.status).toBe(200)
      expect((await response.json()).skipped).toBe(true)
    })
  })

  describe('all or nothing', () => {
    it('answers 500 and uploads nothing when any table read fails', async () => {
      limit
        .mockResolvedValueOnce({ data: [{ id: 1 }], count: 1, error: null })
        .mockResolvedValueOnce({ data: null, count: null, error: { message: 'permission denied' } })
      const response = await GET(request('Bearer s3cret'))
      expect(response.status).toBe(500)
      expect(upload).not.toHaveBeenCalled()
    })

    it('answers 500 when the existence check itself fails', async () => {
      // A broken list must not be read as "no backup yet": that path ends in
      // an upload race every night instead of a red run once.
      list.mockResolvedValue({ data: null, error: { message: 'service unavailable' } })
      expect((await GET(request('Bearer s3cret'))).status).toBe(500)
      expect(from).not.toHaveBeenCalled()
    })

    it('answers 500 on an upload failure that is not the benign race', async () => {
      upload.mockResolvedValue({ error: { message: 'entity too large' } })
      expect((await GET(request('Bearer s3cret'))).status).toBe(500)
    })
  })

  describe('truncation is recorded, never silent', () => {
    it('flags a capped table in the response and keeps the true count', async () => {
      limit.mockResolvedValue({ data: [{ id: 1 }], count: 25_000, error: null })
      const body = await (await GET(request('Bearer s3cret'))).json()
      expect(body.ok).toBe(true)
      expect(body.truncated).toContain('orders')
      expect(body.counts.orders).toBe(25_000)
    })
  })
})
