import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
const sendWebPush = vi.fn()
vi.mock('@/lib/push/web-push', () => ({ sendWebPush: (...a: unknown[]) => sendWebPush(...a) }))
const deleteIn = vi.fn().mockResolvedValue({})
let pages: unknown[][] = []
let readError: { message: string } | null = null
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({
        order: () => ({
          range: async () => ({ data: pages.shift() ?? [], error: readError }),
        }),
      }),
      delete: () => ({ in: deleteIn }),
    }),
  }),
}))

const input = { title: 't', body: 'b', url: '/', tag: 'x' }
const row = (n: number) => ({ endpoint: `https://p/${n}`, p256dh: 'k', auth: 'a' })

describe('broadcastWebPush', () => {
  beforeEach(() => {
    sendWebPush.mockReset()
    deleteIn.mockClear()
    readError = null
  })

  it('sends to every row and prunes gone endpoints', async () => {
    pages = [[row(1), row(2)]]
    sendWebPush.mockResolvedValue({ ok: true, sent: 1, failed: 0, deadEndpoints: ['https://p/2'] })
    const { broadcastWebPush } = await import('./broadcast')
    await expect(broadcastWebPush(input)).resolves.toEqual({
      ok: true,
      sent: 1,
      failed: 0,
      removed: 1,
    })
    expect(deleteIn).toHaveBeenCalledWith('endpoint', ['https://p/2'])
  })

  it('reports a skipped transport as a failure', async () => {
    pages = [[row(1)]]
    sendWebPush.mockResolvedValue({ ok: false, skipped: true, reason: 'VAPID keys not configured' })
    const { broadcastWebPush } = await import('./broadcast')
    await expect(broadcastWebPush(input)).resolves.toEqual({
      ok: false,
      reason: 'VAPID keys not configured',
    })
  })

  it('reports a read error', async () => {
    pages = []
    readError = { message: 'boom' }
    const { broadcastWebPush } = await import('./broadcast')
    await expect(broadcastWebPush(input)).resolves.toEqual({ ok: false, reason: 'boom' })
  })
})
