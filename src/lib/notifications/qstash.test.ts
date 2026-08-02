import { afterEach, describe, expect, it, vi } from 'vitest'
import { notificationBackoffMinutes } from './drain'
import { authorizeNotificationsRequest, wakeNotificationsDrain } from './qstash'

describe('notificationBackoffMinutes', () => {
  it('follows 2 * 4^(n-1)', () => {
    expect(notificationBackoffMinutes(1)).toBe(2)
    expect(notificationBackoffMinutes(2)).toBe(8)
    expect(notificationBackoffMinutes(3)).toBe(32)
  })
})

describe('authorizeNotificationsRequest', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('accepts Bearer CRON_SECRET', () => {
    vi.stubEnv('CRON_SECRET', 'test-secret')
    expect(authorizeNotificationsRequest('Bearer test-secret', null, '', 'https://x/cron')).toBe(
      true,
    )
  })

  it('rejects a wrong bearer', () => {
    vi.stubEnv('CRON_SECRET', 'test-secret')
    expect(authorizeNotificationsRequest('Bearer other', null, '', 'https://x/cron')).toBe(false)
  })
})

describe('wakeNotificationsDrain', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('skips when QSTASH_TOKEN is unset', async () => {
    vi.stubEnv('QSTASH_TOKEN', '')
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://kenyonexpress.co.il')
    await expect(wakeNotificationsDrain('order:1')).resolves.toEqual({
      transport: 'skipped',
      reason: 'no_token',
    })
  })

  it('publishes to QStash when configured', async () => {
    vi.stubEnv('QSTASH_TOKEN', 'tok')
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://kenyonexpress.co.il')
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ messageId: 'msg_1' }),
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(wakeNotificationsDrain('order:abc')).resolves.toEqual({
      transport: 'qstash',
      messageId: 'msg_1',
    })
    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/v2/publish/https://kenyonexpress.co.il/api/cron/notifications')
    expect(init.headers).toMatchObject(
      expect.objectContaining({
        Authorization: 'Bearer tok',
        'Upstash-Failure-Callback': 'https://kenyonexpress.co.il/api/cron/notifications-dlq',
      }),
    )
  })
})
