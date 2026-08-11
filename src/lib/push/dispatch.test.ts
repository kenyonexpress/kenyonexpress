import type { SupabaseClient } from '@supabase/supabase-js'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ANDROID_CHANNEL_ID, pushOutboxRow, toPushMessages } from './dispatch'

const SITE = 'https://kenyonexpress.co.il'

type FakeState = {
  targets: Array<{ expo_token: string; platform: string; locale: string }>
  rpcError: string | null
  disabled: string[]
}

/**
 * The narrow slice of the client this module touches: one rpc and one update.
 * A full mock of postgrest would test the mock, not the dispatch.
 */
function fakeAdmin(state: FakeState): SupabaseClient {
  return {
    rpc: async (_name: string) =>
      state.rpcError
        ? { data: null, error: { message: state.rpcError } }
        : { data: state.targets, error: null },
    from: () => ({
      update: (_values: Record<string, unknown>) => ({
        in: async (_column: string, values: string[]) => {
          state.disabled.push(...values)
          return { error: null }
        },
      }),
    }),
  } as unknown as SupabaseClient
}

function fetchReturning(entries: Array<Record<string, unknown>>) {
  return vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ data: entries }),
  })) as unknown as typeof fetch
}

const ROW = {
  kind: 'voucher_issued',
  payload: { vouchers: [{ id: 'v1', product_name: 'ארוחה' }] } as Record<string, unknown>,
  user_id: 'user-1',
  recipient_email: 'a@b.test',
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('toPushMessages', () => {
  it('stamps the android channel the app actually creates', () => {
    const messages = toPushMessages(['ExponentPushToken[a]'], {
      title: 'כותרת',
      body: 'גוף',
      data: { path: '/coupons' },
    })
    expect(messages[0]).toMatchObject({
      to: 'ExponentPushToken[a]',
      channelId: ANDROID_CHANNEL_ID,
      sound: 'default',
      priority: 'high',
      data: { path: '/coupons' },
    })
  })
})

describe('pushOutboxRow', () => {
  it('settles a kind with no push template as none, without reading tokens', async () => {
    const state: FakeState = { targets: [], rpcError: null, disabled: [] }
    const rpc = vi.fn()
    const admin = { ...fakeAdmin(state), rpc } as unknown as SupabaseClient
    const result = await pushOutboxRow(admin, { ...ROW, kind: 'supplier_sale' }, SITE)
    expect(result).toEqual({ outcome: 'none' })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('skips, rather than fails, when the customer has no device', async () => {
    // A customer who never installed the app is not a delivery failure, and
    // counting it as an attempt would kill the row before they ever install.
    vi.stubEnv('PUSH_ENABLED', 'true')
    const state: FakeState = { targets: [], rpcError: null, disabled: [] }
    const result = await pushOutboxRow(fakeAdmin(state), ROW, SITE)
    expect(result).toEqual({ outcome: 'skipped', reason: 'no registered device' })
  })

  it('skips when push is switched off', async () => {
    vi.stubEnv('PUSH_ENABLED', 'false')
    const state: FakeState = {
      targets: [{ expo_token: 'ExponentPushToken[a]', platform: 'ios', locale: 'he' }],
      rpcError: null,
      disabled: [],
    }
    const result = await pushOutboxRow(fakeAdmin(state), ROW, SITE)
    expect(result).toEqual({ outcome: 'skipped', reason: 'push disabled' })
  })

  it('drops a malformed token before it can poison the whole chunk', async () => {
    vi.stubEnv('PUSH_ENABLED', 'true')
    const state: FakeState = {
      targets: [
        { expo_token: 'not-a-token', platform: 'android', locale: 'he' },
        { expo_token: 'ExponentPushToken[good]', platform: 'ios', locale: 'he' },
      ],
      rpcError: null,
      disabled: [],
    }
    const fetchImpl = fetchReturning([{ status: 'ok', id: 't1' }])
    vi.stubGlobal('fetch', fetchImpl)

    const result = await pushOutboxRow(fakeAdmin(state), ROW, SITE)
    expect(result).toEqual({ outcome: 'sent', recipients: 1 })
    const call = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ]
    const body = JSON.parse(String(call[1].body))
    expect(body).toHaveLength(1)
    expect(body[0].to).toBe('ExponentPushToken[good]')
  })

  it('disables the tokens Expo reported as gone', async () => {
    vi.stubEnv('PUSH_ENABLED', 'true')
    const state: FakeState = {
      targets: [
        { expo_token: 'ExponentPushToken[live]', platform: 'ios', locale: 'he' },
        { expo_token: 'ExponentPushToken[gone]', platform: 'ios', locale: 'he' },
      ],
      rpcError: null,
      disabled: [],
    }
    vi.stubGlobal(
      'fetch',
      fetchReturning([
        { status: 'ok', id: 't1' },
        { status: 'error', message: 'gone', details: { error: 'DeviceNotRegistered' } },
      ]),
    )

    const result = await pushOutboxRow(fakeAdmin(state), ROW, SITE)
    expect(result).toEqual({ outcome: 'sent', recipients: 1 })
    expect(state.disabled).toEqual(['ExponentPushToken[gone]'])
  })

  it('settles rather than retries when every device is gone', async () => {
    vi.stubEnv('PUSH_ENABLED', 'true')
    const state: FakeState = {
      targets: [{ expo_token: 'ExponentPushToken[gone]', platform: 'ios', locale: 'he' }],
      rpcError: null,
      disabled: [],
    }
    vi.stubGlobal(
      'fetch',
      fetchReturning([
        { status: 'error', message: 'gone', details: { error: 'DeviceNotRegistered' } },
      ]),
    )

    const result = await pushOutboxRow(fakeAdmin(state), ROW, SITE)
    // There is nothing left to retry against; four more attempts would each
    // send to the same dead token.
    expect(result).toEqual({ outcome: 'skipped', reason: 'every device unregistered' })
  })

  it('retries a transient ticket error', async () => {
    vi.stubEnv('PUSH_ENABLED', 'true')
    const state: FakeState = {
      targets: [{ expo_token: 'ExponentPushToken[a]', platform: 'ios', locale: 'he' }],
      rpcError: null,
      disabled: [],
    }
    vi.stubGlobal(
      'fetch',
      fetchReturning([
        { status: 'error', message: 'slow down', details: { error: 'MessageRateExceeded' } },
      ]),
    )

    const result = await pushOutboxRow(fakeAdmin(state), ROW, SITE)
    expect(result).toEqual({ outcome: 'retry', reason: 'slow down' })
    expect(state.disabled).toEqual([])
  })

  it('treats an unreadable target lookup as no device, not as a crash', async () => {
    vi.stubEnv('PUSH_ENABLED', 'true')
    const state: FakeState = { targets: [], rpcError: 'permission denied', disabled: [] }
    const result = await pushOutboxRow(fakeAdmin(state), ROW, SITE)
    expect(result).toEqual({ outcome: 'skipped', reason: 'no registered device' })
  })
})
