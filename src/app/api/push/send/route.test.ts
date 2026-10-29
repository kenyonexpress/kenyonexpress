import { beforeEach, describe, expect, it, vi } from 'vitest'

const rpc = vi.fn()
const drain = vi.fn()
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ rpc }) }))
vi.mock('@/app/api/cron/notifications/route', () => ({ GET: (r: Request) => drain(r) }))
vi.mock('@/lib/observability/with-request-log', () => ({
  withRequestLog: (_n: string, h: unknown) => h,
}))

import { NextRequest } from 'next/server'
import { POST } from './route'

const req = (headers: Record<string, string> = {}) =>
  new NextRequest('http://x/api/push/send', { method: 'POST', headers })

describe('/api/push/send', () => {
  beforeEach(() => {
    vi.stubEnv('CRON_SECRET', 'secret-secret-secret')
    rpc.mockReset()
    drain.mockReset()
  })

  it('rejects a request without the cron secret', async () => {
    expect((await POST(req())).status).toBe(401)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('queues T-7 and T-1 then drains', async () => {
    rpc.mockResolvedValue({ data: 3, error: null })
    drain.mockResolvedValue(Response.json({ ok: true, pushed: 2 }))
    const res = await POST(req({ 'x-cron-secret': 'secret-secret-secret' }))
    expect(rpc).toHaveBeenCalledWith('enqueue_expiring_voucher_notices', { p_buckets: [7, 1] })
    expect(await res.json()).toEqual({ ok: true, queued: 3, drain: { ok: true, pushed: 2 } })
  })

  it('does not drain when queueing fails', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'boom' } })
    expect((await POST(req({ 'x-cron-secret': 'secret-secret-secret' }))).status).toBe(500)
    expect(drain).not.toHaveBeenCalled()
  })
})
