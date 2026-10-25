import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Auth gate for the stock notification sender. It reads products with admin
 * credentials, sends emails, and invalidates the catalogue cache; all stay
 * unreachable for a bad caller.
 */

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  fetchWithTimeout: vi.fn(),
  revalidateTag: vi.fn(),
}))

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: mocks.createAdminClient }))
vi.mock('@/lib/http/fetch-with-timeout', () => ({ fetchWithTimeout: mocks.fetchWithTimeout }))
vi.mock('next/cache', () => ({ revalidateTag: mocks.revalidateTag }))

import { CATALOGUE_TAG } from '@/lib/catalogue-cache'
import { GET } from './route'

function request(auth?: string): NextRequest {
  return new NextRequest('https://example.test/api/cron/stock-notifications', {
    headers: auth ? { authorization: auth } : {},
  })
}

function mockAdminClient(notifications: unknown[] = []) {
  return {
    from: () => ({
      select: () => ({
        is: () => ({
          is: () => ({
            gt: () =>
              Promise.resolve({
                data: notifications,
                error: null,
              }),
          }),
        }),
      }),
      update: () => ({
        eq: () => Promise.resolve({ error: null }),
      }),
    }),
  }
}

describe('stock-notifications cron auth', () => {
  beforeEach(() => {
    mocks.createAdminClient.mockReset()
    mocks.fetchWithTimeout.mockReset()
    mocks.revalidateTag.mockReset()
    vi.stubEnv('CRON_SECRET', 's3cret')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('rejects a request with no credential before touching the database', async () => {
    expect((await GET(request())).status).toBe(401)
    expect(mocks.createAdminClient).not.toHaveBeenCalled()
  })

  it('rejects a wrong credential', async () => {
    expect((await GET(request('Bearer wrong'))).status).toBe(401)
    expect(mocks.createAdminClient).not.toHaveBeenCalled()
  })

  it('stays closed when CRON_SECRET is unset rather than opening', async () => {
    vi.stubEnv('CRON_SECRET', '')
    expect((await GET(request('Bearer '))).status).toBe(401)
    expect(mocks.createAdminClient).not.toHaveBeenCalled()
  })
})

describe('stock-notifications cache invalidation', () => {
  beforeEach(() => {
    mocks.createAdminClient.mockReset()
    mocks.fetchWithTimeout.mockReset()
    mocks.revalidateTag.mockReset()
    vi.stubEnv('CRON_SECRET', 's3cret')
    vi.stubEnv('RESEND_API_KEY', 'test-key')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('does not invalidate when no notifications are pending', async () => {
    mocks.createAdminClient.mockReturnValue(mockAdminClient([]))
    await GET(request('Bearer s3cret'))
    expect(mocks.revalidateTag).not.toHaveBeenCalled()
  })

  it('invalidates the catalogue cache with max lifetime when notifications are sent', async () => {
    const mockNotifications = [
      {
        id: 'notif-1',
        product_id: 'prod-1',
        email: 'user@example.com',
        user_id: 'user-1',
        products: {
          id: 'prod-1',
          name_he: 'מוצר בודק',
          stock_quantity: 5,
        },
      },
    ]

    mocks.createAdminClient.mockReturnValue(mockAdminClient(mockNotifications))
    mocks.fetchWithTimeout.mockResolvedValue({ ok: true })

    await GET(request('Bearer s3cret'))

    expect(mocks.revalidateTag).toHaveBeenCalledWith(CATALOGUE_TAG, 'max')
  })

  it('invalidates once per product group, not per notification', async () => {
    const mockNotifications = [
      {
        id: 'notif-1',
        product_id: 'prod-1',
        email: 'user1@example.com',
        user_id: 'user-1',
        products: {
          id: 'prod-1',
          name_he: 'מוצר בודק',
          stock_quantity: 5,
        },
      },
      {
        id: 'notif-2',
        product_id: 'prod-1',
        email: 'user2@example.com',
        user_id: 'user-2',
        products: {
          id: 'prod-1',
          name_he: 'מוצר בודק',
          stock_quantity: 5,
        },
      },
    ]

    mocks.createAdminClient.mockReturnValue(mockAdminClient(mockNotifications))
    mocks.fetchWithTimeout.mockResolvedValue({ ok: true })

    await GET(request('Bearer s3cret'))

    // Should be called once per product, not per notification
    expect(mocks.revalidateTag).toHaveBeenCalledTimes(1)
    expect(mocks.revalidateTag).toHaveBeenCalledWith(CATALOGUE_TAG, 'max')
  })

  it('still invalidates when email send fails', async () => {
    const mockNotifications = [
      {
        id: 'notif-1',
        product_id: 'prod-1',
        email: 'user@example.com',
        user_id: 'user-1',
        products: {
          id: 'prod-1',
          name_he: 'מוצר בודק',
          stock_quantity: 5,
        },
      },
    ]

    mocks.createAdminClient.mockReturnValue(mockAdminClient(mockNotifications))
    mocks.fetchWithTimeout.mockResolvedValue({ ok: false })

    await GET(request('Bearer s3cret'))

    // Cache invalidation happens after email attempt, regardless of success
    expect(mocks.revalidateTag).toHaveBeenCalledWith(CATALOGUE_TAG, 'max')
  })
})
