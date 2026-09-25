import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * `loadPushSubscriptions` against a scripted request-scoped client: it reads
 * under RLS with no user filter of its own, never selects the keys, maps the
 * user agent to a label, and treats an unapplied 179 as an empty list.
 */

type Result = { data: unknown; error: unknown }
let result: Result = { data: [], error: null }
const calls: { method: string; args: unknown[] }[] = []

function tableBuilder() {
  const builder: Record<string, unknown> = {}
  for (const method of ['select', 'eq', 'order', 'limit']) {
    builder[method] = (...args: unknown[]) => {
      calls.push({ method, args })
      return builder
    }
  }
  // biome-ignore lint/suspicious/noThenProperty: the Supabase builder is a thenable and the read awaits it with no terminal
  builder.then = (resolve: (v: unknown) => unknown) => resolve({ ...result })
  return builder
}

const from = vi.fn(() => tableBuilder())
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ from }),
}))
const adminFrom = vi.fn()
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: adminFrom }),
}))
const logWarn = vi.fn()
vi.mock('@/lib/observability/log', () => ({
  log: { warn: (...a: unknown[]) => logWarn(...a), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}))

const { loadPushSubscriptions } = await import('./push-subscriptions')

beforeEach(() => {
  calls.length = 0
  result = { data: [], error: null }
  from.mockClear()
  adminFrom.mockClear()
  logWarn.mockReset()
})

describe('loadPushSubscriptions', () => {
  it('reads the caller-scoped table with no user filter and without the keys', async () => {
    await loadPushSubscriptions()
    expect(from).toHaveBeenCalledWith('push_subscriptions')
    expect(adminFrom).not.toHaveBeenCalled()
    const select = calls.find((c) => c.method === 'select')?.args[0] as string
    expect(select).not.toMatch(/p256dh|auth/)
    expect(calls.some((c) => c.method === 'eq')).toBe(false)
  })

  it('maps rows to labelled devices, newest first as the query orders them', async () => {
    result = {
      data: [
        {
          id: 's-1',
          endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
          user_agent:
            'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/128.0.0.0 Mobile Safari/537.36',
          created_at: '2026-09-25T10:00:00Z',
          updated_at: '2026-09-25T10:00:00Z',
        },
        {
          id: 's-2',
          endpoint: 'https://web.push.apple.com/xyz',
          user_agent: null,
          created_at: '2026-09-20T10:00:00Z',
          updated_at: '2026-09-21T10:00:00Z',
        },
      ],
      error: null,
    }
    const devices = await loadPushSubscriptions()
    expect(devices).toEqual([
      {
        id: 's-1',
        endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
        label: 'Chrome, Android',
        createdAt: '2026-09-25T10:00:00Z',
        updatedAt: '2026-09-25T10:00:00Z',
      },
      {
        id: 's-2',
        endpoint: 'https://web.push.apple.com/xyz',
        label: 'דפדפן',
        createdAt: '2026-09-20T10:00:00Z',
        updatedAt: '2026-09-21T10:00:00Z',
      },
    ])
    const order = calls.find((c) => c.method === 'order')
    expect(order?.args).toEqual(['created_at', { ascending: false }])
  })

  it('answers an empty list, quietly, while 179 is absent', async () => {
    result = { data: null, error: { code: 'PGRST205', message: 'schema cache' } }
    expect(await loadPushSubscriptions()).toEqual([])
    expect(logWarn).not.toHaveBeenCalled()
  })

  it('answers an empty list and logs on any other failure', async () => {
    result = { data: null, error: { code: '42501', message: 'permission denied' } }
    expect(await loadPushSubscriptions()).toEqual([])
    expect(logWarn).toHaveBeenCalledWith('push.subscriptions_read_failed', {
      reason: 'permission denied',
    })
  })
})
