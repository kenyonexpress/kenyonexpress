import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
const sendNotification = vi.fn()
vi.mock('web-push', () => ({
  default: {
    setVapidDetails: vi.fn(),
    sendNotification: (...a: unknown[]) => sendNotification(...a),
  },
}))

const content = { title: 'הקופון פג בעוד 7 ימים', body: 'גוף', data: { url: '/account/coupons' } }
const sub = (n: number) => ({ endpoint: `https://push.example/${n}`, p256dh: 'k', auth: 'a' })

describe('browser push', () => {
  beforeEach(() => {
    vi.resetModules()
    sendNotification.mockReset()
    vi.stubEnv('NEXT_PUBLIC_VAPID_PUBLIC_KEY', 'pub')
    vi.stubEnv('VAPID_PRIVATE_KEY', 'priv')
  })

  it('skips without VAPID keys rather than failing', async () => {
    vi.stubEnv('VAPID_PRIVATE_KEY', '')
    const { sendWebPush } = await import('./web-push')
    await expect(sendWebPush([sub(1)], content, 't')).resolves.toEqual({
      ok: false,
      skipped: true,
      reason: 'VAPID keys not configured',
    })
  })

  it('reports gone subscriptions so the caller can delete them', async () => {
    sendNotification
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(Object.assign(new Error('gone'), { statusCode: 410 }))
      .mockRejectedValueOnce(Object.assign(new Error('boom'), { statusCode: 500 }))
    const { sendWebPush } = await import('./web-push')
    const result = await sendWebPush([sub(1), sub(2), sub(3)], content, 'voucher_expiring:v1')
    expect(result).toEqual({
      ok: true,
      sent: 1,
      deadEndpoints: ['https://push.example/2'],
      failed: 1,
    })
  })

  it('sends title, body, url and a collapsing tag', async () => {
    const { webPushPayload } = await import('./web-push')
    expect(JSON.parse(webPushPayload(content, 'voucher_expiring:v1'))).toEqual({
      title: content.title,
      body: 'גוף',
      url: '/account/coupons',
      tag: 'voucher_expiring:v1',
    })
  })
})
