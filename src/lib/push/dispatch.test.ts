import type { SupabaseClient } from '@supabase/supabase-js'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ANDROID_CHANNEL_ID, pushOutboxRow, toPushMessages } from './dispatch'

const SITE = 'https://kenyonexpress.co.il'

type FakeState = {
  targets: Array<{ expo_token: string; platform: string; locale: string }>
  rpcError: string | null
  disabled: string[]
  /** `notification_preferences` rows, the setting nothing used to read. */
  preferences?: Array<{ kind: string; channel: string; enabled: boolean }>
  /** `push_subscriptions` rows; empty means no browser has subscribed. */
  subscriptions?: Array<Record<string, unknown>>
  /** Ids passed to the dead-subscription delete. */
  deletedSubscriptions?: string[]
}

/**
 * The narrow slice of the client this module touches: one rpc, one update, and
 * since [45] two table reads. A full mock of postgrest would test the mock, not
 * the dispatch.
 *
 * `push_subscriptions` defaults to EMPTY rather than absent, so every test that
 * predates the web leg still exercises the Expo path alone -- which is what
 * those tests are about.
 */
function fakeAdmin(state: FakeState): SupabaseClient {
  return {
    rpc: async (_name: string) =>
      state.rpcError
        ? { data: null, error: { message: state.rpcError } }
        : { data: state.targets, error: null },
    from: (table: string) => ({
      select: (_columns: string) => ({
        eq: async (_column: string, _value: string) => {
          if (table === 'notification_preferences') {
            return { data: state.preferences ?? [], error: null }
          }
          if (table === 'push_subscriptions') {
            return { data: state.subscriptions ?? [], error: null }
          }
          return { data: [], error: null }
        },
      }),
      insert: async (_values: Record<string, unknown>) => ({ error: null }),
      delete: () => ({
        in: async (_column: string, values: string[]) => {
          state.deletedSubscriptions?.push(...values)
          return { error: null }
        },
      }),
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

describe('the preference the account page has always been writing', () => {
  /**
   * MEASURED 2026-09-09: nothing read `notification_preferences`. A customer
   * could switch a kind off in every channel, see it saved, and keep receiving
   * it. `preferences.ts` names that exact failure in its own header as the
   * reason operator kinds are refused rather than silently defaulted, and the
   * senders were doing it anyway.
   */
  it('does not send a kind the customer switched off', async () => {
    const state: FakeState = {
      targets: [{ expo_token: 'ExponentPushToken[a]', platform: 'ios', locale: 'he' }],
      rpcError: null,
      disabled: [],
      preferences: [{ kind: 'order_shipped', channel: 'push', enabled: false }],
    }
    const result = await pushOutboxRow(fakeAdmin(state), { ...ROW, kind: 'order_shipped' }, SITE)

    expect(result).toEqual({ outcome: 'skipped', reason: 'switched off by the customer' })
  })

  it('skips rather than settling, so switching it back on works', async () => {
    // `none` means the KIND never owes a push and settles the row for good.
    // Using it here would make the switch one-way.
    const state: FakeState = {
      targets: [],
      rpcError: null,
      disabled: [],
      preferences: [{ kind: 'order_shipped', channel: 'push', enabled: false }],
    }
    const result = await pushOutboxRow(fakeAdmin(state), { ...ROW, kind: 'order_shipped' }, SITE)
    expect(result.outcome).not.toBe('none')
  })

  it('ignores a switch for a different channel', async () => {
    // Turning email off must not turn push off. One row per (kind, channel) is
    // the whole reason the table has a channel column.
    const state: FakeState = {
      targets: [{ expo_token: 'ExponentPushToken[a]', platform: 'ios', locale: 'he' }],
      rpcError: null,
      disabled: [],
      preferences: [{ kind: 'order_shipped', channel: 'email', enabled: false }],
    }
    vi.stubEnv('PUSH_ENABLED', 'true')
    vi.stubGlobal('fetch', fetchReturning([{ status: 'ok', id: 'r1' }]))

    const result = await pushOutboxRow(fakeAdmin(state), { ...ROW, kind: 'order_shipped' }, SITE)
    expect(result).toMatchObject({ outcome: 'sent' })
  })

  it('cannot be switched off for a kind that is the thing bought', async () => {
    // `voucher_issued` is REQUIRED: it is the coupon itself. A stray row saying
    // otherwise -- from a bug, a migration or somebody with SQL access -- must
    // not stop it.
    const state: FakeState = {
      targets: [{ expo_token: 'ExponentPushToken[a]', platform: 'ios', locale: 'he' }],
      rpcError: null,
      disabled: [],
      preferences: [{ kind: 'voucher_issued', channel: 'push', enabled: false }],
    }
    vi.stubEnv('PUSH_ENABLED', 'true')
    vi.stubGlobal('fetch', fetchReturning([{ status: 'ok', id: 'r1' }]))

    const result = await pushOutboxRow(fakeAdmin(state), ROW, SITE)
    expect(result).toMatchObject({ outcome: 'sent' })
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
    expect(result.outcome).toBe('skipped')
    // Composite since [45]: the reason names BOTH transports, so "nothing was
    // sent" can be told apart from "one of the two had nothing to send to".
    expect(result).toMatchObject({ reason: expect.stringContaining('no registered device') })
  })

  it('skips when push is switched off', async () => {
    vi.stubEnv('PUSH_ENABLED', 'false')
    const state: FakeState = {
      targets: [{ expo_token: 'ExponentPushToken[a]', platform: 'ios', locale: 'he' }],
      rpcError: null,
      disabled: [],
    }
    const result = await pushOutboxRow(fakeAdmin(state), ROW, SITE)
    expect(result.outcome).toBe('skipped')
    expect(result).toMatchObject({ reason: expect.stringContaining('push disabled') })
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
    expect(result.outcome).toBe('skipped')
    expect(result).toMatchObject({ reason: expect.stringContaining('every device unregistered') })
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
    expect(result).toEqual({ outcome: 'retry', reason: 'expo: slow down' })
    expect(state.disabled).toEqual([])
  })

  it('treats an unreadable target lookup as no device, not as a crash', async () => {
    vi.stubEnv('PUSH_ENABLED', 'true')
    const state: FakeState = { targets: [], rpcError: 'permission denied', disabled: [] }
    const result = await pushOutboxRow(fakeAdmin(state), ROW, SITE)
    expect(result.outcome).toBe('skipped')
    // Composite since [45]: the reason names BOTH transports, so "nothing was
    // sent" can be told apart from "one of the two had nothing to send to".
    expect(result).toMatchObject({ reason: expect.stringContaining('no registered device') })
  })
})
