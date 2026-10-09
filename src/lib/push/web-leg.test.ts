import type { SupabaseClient } from '@supabase/supabase-js'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { endpointHost, sendWebPushLeg } from './web-leg'

/**
 * The fan-out to a customer's browsers, and the bookkeeping that follows it.
 *
 * WHAT THIS IS REALLY ABOUT. A customer has more than one browser and they fail
 * independently: the phone whose browser data was cleared answers 410 forever
 * while the desktop works. Every assertion here is about not letting one of
 * those two determine the fate of the other.
 *
 * `sendWebPush` is mocked. It is the only function in the module that opens a
 * socket, and what is worth testing here is what the leg DOES with each answer:
 * which rows it deletes, what it writes to the log, and what it reports back.
 */

vi.mock('./web-push', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./web-push')>()
  return { ...actual, sendWebPush: vi.fn() }
})

const { sendWebPush } = await import('./web-push')
const sendMock = vi.mocked(sendWebPush)

const CONTENT = { title: 'ההזמנה יצאה', body: 'משלוח בדרך', data: { url: '/account/orders' } }
const ROW = { id: 'outbox-1', kind: 'order_shipped', user_id: 'user-1' }

function subscription(id: string, host = 'fcm.googleapis.com') {
  return {
    id,
    user_id: 'user-1',
    endpoint: `https://${host}/send/${id}`,
    p256dh: 'p',
    auth: 'a',
  }
}

interface State {
  subscriptions: ReturnType<typeof subscription>[]
  deleted: string[]
  logged: Record<string, unknown>[]
  selectError?: { code?: string; message: string }
}

function fakeAdmin(state: State): SupabaseClient {
  return {
    from: (table: string) => ({
      select: () => ({
        eq: async () =>
          state.selectError
            ? { data: null, error: state.selectError }
            : { data: state.subscriptions, error: null },
      }),
      insert: async (values: Record<string, unknown>) => {
        if (table === 'push_deliveries') state.logged.push(values)
        return { error: null }
      },
      delete: () => ({
        in: async (_column: string, ids: string[]) => {
          state.deleted.push(...ids)
          return { error: null }
        },
      }),
    }),
  } as unknown as SupabaseClient
}

function withVapid() {
  vi.stubEnv('NEXT_PUBLIC_VAPID_PUBLIC_KEY', 'pub')
  vi.stubEnv('VAPID_PRIVATE_KEY', 'priv')
}

afterEach(() => {
  vi.unstubAllEnvs()
  sendMock.mockReset()
})

describe('endpointHost', () => {
  it('keeps the service and drops the capability', () => {
    // THE ENDPOINT IS A BEARER TOKEN: anyone holding it can push to that
    // browser. It must never reach a log, a ticket or a dashboard.
    const host = endpointHost('https://fcm.googleapis.com/fcm/send/cAbC-secret-path')
    expect(host).toBe('fcm.googleapis.com')
    expect(host).not.toContain('secret-path')
  })

  it('returns null for something that is not a URL rather than throwing', () => {
    expect(endpointHost('not a url')).toBeNull()
  })
})

describe('the web push leg', () => {
  it('does nothing at all without VAPID keys', async () => {
    const state: State = { subscriptions: [subscription('s1')], deleted: [], logged: [] }
    const result = await sendWebPushLeg(fakeAdmin(state), ROW, CONTENT)

    expect(result.reason).toContain('VAPID')
    // Not one send attempted: an unconfigured server must not burn the row's
    // retries discovering that it is unconfigured.
    expect(sendMock).not.toHaveBeenCalled()
  })

  it('reports no browser rather than a failure when nobody has subscribed', async () => {
    withVapid()
    const state: State = { subscriptions: [], deleted: [], logged: [] }
    const result = await sendWebPushLeg(fakeAdmin(state), ROW, CONTENT)

    expect(result).toMatchObject({ sent: 0, retry: 0, gone: 0 })
    expect(result.reason).toContain('no browser')
  })

  it('sends to every browser the customer said yes in', async () => {
    withVapid()
    sendMock.mockResolvedValue({ kind: 'sent' })
    const state: State = {
      subscriptions: [subscription('s1'), subscription('s2')],
      deleted: [],
      logged: [],
    }

    const result = await sendWebPushLeg(fakeAdmin(state), ROW, CONTENT)
    expect(result.sent).toBe(2)
    expect(sendMock).toHaveBeenCalledTimes(2)
  })

  it('deletes the dead browser and keeps the working one', async () => {
    withVapid()
    sendMock
      .mockResolvedValueOnce({ kind: 'gone', status: 410 })
      .mockResolvedValueOnce({ kind: 'sent' })
    const state: State = {
      subscriptions: [subscription('dead'), subscription('alive')],
      deleted: [],
      logged: [],
    }

    const result = await sendWebPushLeg(fakeAdmin(state), ROW, CONTENT)

    expect(result).toMatchObject({ sent: 1, gone: 1 })
    // Only the dead one, and it really is deleted: a 410 endpoint is never
    // valid again, so keeping it means a round trip every run forever.
    expect(state.deleted).toEqual(['dead'])
  })

  it('writes one delivery row per browser, with the host and not the endpoint', async () => {
    withVapid()
    sendMock.mockResolvedValue({ kind: 'gone', status: 410 })
    const state: State = { subscriptions: [subscription('s1')], deleted: [], logged: [] }

    await sendWebPushLeg(fakeAdmin(state), ROW, CONTENT)

    expect(state.logged).toHaveLength(1)
    expect(state.logged[0]).toMatchObject({
      outbox_id: 'outbox-1',
      subscription_id: 's1',
      kind: 'order_shipped',
      transport: 'web',
      outcome: 'gone',
      status_code: 410,
      endpoint_host: 'fcm.googleapis.com',
    })
    // The record of WHY a subscription vanished has to outlive the
    // subscription, which is why subscription_id is not a foreign key.
    expect(state.deleted).toEqual(['s1'])
    expect(JSON.stringify(state.logged[0])).not.toContain('/send/s1')
  })

  it('separates a transient failure from a permanent rejection', async () => {
    withVapid()
    sendMock
      .mockResolvedValueOnce({ kind: 'retry', status: 503, reason: 'unavailable' })
      .mockResolvedValueOnce({ kind: 'rejected', status: 400, reason: 'bad key' })
    const state: State = {
      subscriptions: [subscription('s1'), subscription('s2')],
      deleted: [],
      logged: [],
    }

    const result = await sendWebPushLeg(fakeAdmin(state), ROW, CONTENT)

    expect(result).toMatchObject({ retry: 1, rejected: 1, gone: 0 })
    // Neither is deleted: one may work next time, and the other is our bug to
    // fix rather than the customer's subscription to throw away.
    expect(state.deleted).toEqual([])
  })

  it('treats an unapplied 179 as nothing to send to, not as a failure', async () => {
    withVapid()
    const state: State = {
      subscriptions: [],
      deleted: [],
      logged: [],
      selectError: { code: '42P01', message: 'relation does not exist' },
    }

    const result = await sendWebPushLeg(fakeAdmin(state), ROW, CONTENT)
    expect(result).toMatchObject({ retry: 0, sent: 0 })
    expect(result.reason).toContain('179')
  })

  it('retries a read that failed for a real reason', async () => {
    withVapid()
    const state: State = {
      subscriptions: [],
      deleted: [],
      logged: [],
      selectError: { code: '57014', message: 'statement timeout' },
    }

    const result = await sendWebPushLeg(fakeAdmin(state), ROW, CONTENT)
    expect(result.retry).toBe(1)
  })

  it('has nothing to look up for a notification with no account', async () => {
    withVapid()
    const state: State = { subscriptions: [], deleted: [], logged: [] }
    const result = await sendWebPushLeg(fakeAdmin(state), { ...ROW, user_id: null }, CONTENT)

    expect(result.reason).toContain('no account')
    expect(sendMock).not.toHaveBeenCalled()
  })
})
