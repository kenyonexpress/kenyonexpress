import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const revalidateTag = vi.fn()

vi.mock('next/cache', () => ({ revalidateTag: (...args: unknown[]) => revalidateTag(...args) }))

vi.mock('@/lib/observability/log', () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

import { POST } from './route'

function request(body: unknown, auth?: string): NextRequest {
  return new NextRequest('https://example.test/api/revalidate', {
    method: 'POST',
    headers: {
      ...(auth ? { authorization: auth } : {}),
      'content-type': 'application/json',
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

describe('POST /api/revalidate', () => {
  beforeEach(() => {
    revalidateTag.mockReset()
    vi.stubEnv('CRON_SECRET', 's3cret')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  describe('auth', () => {
    it('rejects a request with no credential', async () => {
      const res = await POST(request({ table: 'products' }))
      expect(res.status).toBe(401)
      expect(revalidateTag).not.toHaveBeenCalled()
    })

    it('rejects a wrong credential', async () => {
      const res = await POST(request({ table: 'products' }, 'Bearer wrong'))
      expect(res.status).toBe(401)
      expect(revalidateTag).not.toHaveBeenCalled()
    })

    it('stays closed when CRON_SECRET is unset rather than opening', async () => {
      // This endpoint flips cached content live on a shared, unauthenticated
      // path. An unconfigured deploy must not be an open one.
      vi.stubEnv('CRON_SECRET', '')
      const res = await POST(request({ table: 'products' }, 'Bearer '))
      expect(res.status).toBe(401)
      expect(revalidateTag).not.toHaveBeenCalled()
    })
  })

  describe('body', () => {
    it('rejects invalid json', async () => {
      const res = await POST(request('not json', 'Bearer s3cret'))
      expect(res.status).toBe(400)
      expect(revalidateTag).not.toHaveBeenCalled()
    })

    it('rejects a body missing table', async () => {
      const res = await POST(request({}, 'Bearer s3cret'))
      expect(res.status).toBe(400)
      expect(revalidateTag).not.toHaveBeenCalled()
    })

    it('rejects a table with no cache tag, rather than silently no-op accepting it', async () => {
      const res = await POST(request({ table: 'orders' }, 'Bearer s3cret'))
      expect(res.status).toBe(400)
      expect(revalidateTag).not.toHaveBeenCalled()
    })
  })

  describe('known tables', () => {
    it.each([
      ['products', 'catalogue'],
      ['categories', 'catalogue'],
      ['deals', 'catalogue'],
      ['contact_channels', 'contact-channels'],
      ['page_contact_config', 'contact-channels'],
    ])('revalidates the tag wired to %s', async (table, tag) => {
      const res = await POST(request({ table }, 'Bearer s3cret'))
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ ok: true, table, tag })
      expect(revalidateTag).toHaveBeenCalledWith(tag, 'hours')
    })

    it('does not revalidate a tag it was not asked for', async () => {
      await POST(request({ table: 'products' }, 'Bearer s3cret'))
      expect(revalidateTag).toHaveBeenCalledTimes(1)
      expect(revalidateTag).not.toHaveBeenCalledWith('contact-channels', expect.anything())
    })
  })
})
