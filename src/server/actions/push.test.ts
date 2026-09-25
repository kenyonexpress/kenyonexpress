import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The three push actions against a scripted admin client: every one refuses
 * a visitor, the by-id remove is filtered on the caller and rejects anything
 * that is not a uuid, and an unapplied 179 reads as "not available", never as
 * a crash.
 */

const calls: { method: string; args: unknown[] }[] = []
let writeResult: { error: unknown } = { error: null }

function tableBuilder() {
  const builder: Record<string, unknown> = {}
  for (const method of ['upsert', 'delete', 'eq']) {
    builder[method] = (...args: unknown[]) => {
      calls.push({ method, args })
      return builder
    }
  }
  // biome-ignore lint/suspicious/noThenProperty: the Supabase builder is a thenable and the write awaits it with no terminal
  builder.then = (resolve: (v: unknown) => unknown) => resolve({ ...writeResult })
  return builder
}

const adminFrom = vi.fn(() => tableBuilder())
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: adminFrom }),
}))
let user: { id: string } | null = { id: 'u-1' }
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user } }) } }),
}))
vi.mock('@/lib/utils/rate-limit', () => ({
  checkRateLimit: async () => true,
  getClientIp: async () => '203.0.113.9',
}))
vi.mock('next/headers', () => ({
  headers: async () => new Headers({ 'user-agent': 'test-agent' }),
}))
const revalidatePath = vi.fn()
vi.mock('next/cache', () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }))
vi.mock('@/lib/observability/action-context', () => ({
  withActionContext: async <T>(_name: string, fn: () => Promise<T>) => fn(),
}))
vi.mock('@/lib/observability/log', () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

const { removePushSubscription, removePushSubscriptionById, savePushSubscription } = await import(
  './push'
)

const ID = '3f2c8d1e-9a4b-4c6d-8e7f-0a1b2c3d4e5f'
const VALID = {
  endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
  keys: { p256dh: 'B'.repeat(87), auth: 'a'.repeat(22) },
}

beforeEach(() => {
  calls.length = 0
  writeResult = { error: null }
  user = { id: 'u-1' }
  adminFrom.mockClear()
  revalidatePath.mockReset()
})

describe('removePushSubscriptionById', () => {
  it('refuses a visitor and touches nothing', async () => {
    user = null
    expect(await removePushSubscriptionById(ID)).toEqual({
      error: 'צריך להתחבר כדי להפעיל התראות',
    })
    expect(adminFrom).not.toHaveBeenCalled()
  })

  it('rejects anything that is not a uuid before reaching the database', async () => {
    for (const bad of ['', 'abc', "1' or '1'='1", ID.slice(0, -1)]) {
      const result = await removePushSubscriptionById(bad)
      expect('error' in result).toBe(true)
    }
    expect(adminFrom).not.toHaveBeenCalled()
  })

  it("deletes by id AND by the caller's user_id, then revalidates the page", async () => {
    expect(await removePushSubscriptionById(ID)).toEqual({ success: true })
    expect(adminFrom).toHaveBeenCalledWith('push_subscriptions')
    expect(calls.map((c) => c.method)).toEqual(['delete', 'eq', 'eq'])
    expect(calls[1]?.args).toEqual(['id', ID])
    expect(calls[2]?.args).toEqual(['user_id', 'u-1'])
    expect(revalidatePath).toHaveBeenCalledWith('/account/notifications')
  })

  it('reads an unapplied 179 as "not available yet"', async () => {
    writeResult = { error: { code: 'PGRST205', message: 'schema cache' } }
    expect(await removePushSubscriptionById(ID)).toEqual({
      error: 'התראות עדיין לא זמינות בחשבון הזה, נסו שוב בקרוב',
    })
    expect(revalidatePath).not.toHaveBeenCalled()
  })
})

describe('the two existing actions', () => {
  it('savePushSubscription upserts on endpoint for the caller and revalidates', async () => {
    expect(await savePushSubscription(VALID)).toEqual({ success: true })
    const upsert = calls.find((c) => c.method === 'upsert')
    expect(upsert?.args[0]).toMatchObject({ endpoint: VALID.endpoint, user_id: 'u-1' })
    expect(upsert?.args[1]).toEqual({ onConflict: 'endpoint' })
    expect(revalidatePath).toHaveBeenCalledWith('/account/notifications')
  })

  it('removePushSubscription filters on the caller as well as the endpoint', async () => {
    expect(await removePushSubscription(VALID.endpoint)).toEqual({ success: true })
    expect(calls.map((c) => c.method)).toEqual(['delete', 'eq', 'eq'])
    expect(calls[2]?.args).toEqual(['user_id', 'u-1'])
  })
})
