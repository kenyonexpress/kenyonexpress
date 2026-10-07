import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The nightly sitemap regeneration (STEP 37). Pinned: closed without the
 * secret, stales exactly the sitemap and feed tags with the SWR profile, warms
 * the sitemap on the origin the scheduler used, and turns an empty or failed
 * sitemap into a red run rather than an `ok`. `next/cache` is mocked because
 * `revalidateTag` throws outside a Next work store.
 */

const { revalidateTag, revalidatePath } = vi.hoisted(() => ({
  revalidateTag: vi.fn(),
  revalidatePath: vi.fn(),
}))
vi.mock('next/cache', () => ({ revalidateTag, revalidatePath }))

const fetchMock = vi.fn()

import { GET } from './route'

function request(auth?: string): NextRequest {
  return new NextRequest('https://kenyonexpress.vercel.app/api/cron/sitemap-regen', {
    headers: auth ? { authorization: auth } : {},
  })
}

const SITEMAP = `<?xml version="1.0"?><urlset>
<url><loc>https://kenyonexpress.co.il/</loc></url>
<url><loc>https://kenyonexpress.co.il/products</loc></url>
<url><loc>https://kenyonexpress.co.il/product/a</loc></url>
</urlset>`

describe('sitemap-regen cron', () => {
  beforeEach(() => {
    revalidateTag.mockReset()
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
    vi.stubEnv('CRON_SECRET', 's3cret')
    fetchMock.mockResolvedValue(new Response(SITEMAP, { status: 200 }))
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  describe('auth', () => {
    it('rejects a request with no credential before touching the cache', async () => {
      expect((await GET(request())).status).toBe(401)
      expect(revalidateTag).not.toHaveBeenCalled()
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('rejects a wrong credential', async () => {
      expect((await GET(request('Bearer wrong'))).status).toBe(401)
      expect(revalidateTag).not.toHaveBeenCalled()
    })

    it('stays closed when CRON_SECRET is unset rather than opening', async () => {
      vi.stubEnv('CRON_SECRET', '')
      expect((await GET(request('Bearer '))).status).toBe(401)
      expect(revalidateTag).not.toHaveBeenCalled()
    })
  })

  it('stales the sitemap and feed tags, SWR, and nothing else', async () => {
    const response = await GET(request('Bearer s3cret'))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual({ ok: true, revalidated: ['sitemap', 'feed'], status: 200, urls: 3 })
    expect(revalidateTag.mock.calls).toEqual([
      ['sitemap', 'max'],
      ['feed', 'max'],
    ])
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('warms the sitemap on the origin the scheduler called, not the apex', async () => {
    await GET(request('Bearer s3cret'))

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit]
    expect(String(url)).toBe('https://kenyonexpress.vercel.app/sitemap.xml')
    expect(init.cache).toBe('no-store')
  })

  it('is red on an empty sitemap, which is a deindexing request', async () => {
    fetchMock.mockResolvedValue(
      new Response('<?xml version="1.0"?><urlset></urlset>', { status: 200 }),
    )
    const response = await GET(request('Bearer s3cret'))
    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({
      ok: false,
      revalidated: ['sitemap', 'feed'],
      status: 200,
      urls: 0,
    })
  })

  it('is red when the sitemap does not answer 200', async () => {
    fetchMock.mockResolvedValue(new Response('challenge', { status: 403 }))
    const response = await GET(request('Bearer s3cret'))
    expect(response.status).toBe(500)
    expect((await response.json()).status).toBe(403)
  })

  it('is red when the warm fetch throws, after the tags were staled', async () => {
    fetchMock.mockRejectedValue(new Error('timeout'))
    const response = await GET(request('Bearer s3cret'))
    expect(response.status).toBe(500)
    expect(revalidateTag).toHaveBeenCalledTimes(2)
  })
})
