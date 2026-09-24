import { beforeEach, describe, expect, it, vi } from 'vitest'

const rpc = vi.fn()
const upsert = vi.fn()
const getUser = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser },
    rpc,
    from: () => ({ upsert }),
  }),
}))
vi.mock('@/lib/utils/rate-limit', () => ({
  checkRateLimit: async () => true,
  getClientIp: async () => '203.0.113.9',
}))
vi.mock('next/headers', () => ({
  headers: async () => new Headers({ 'user-agent': 'test-agent' }),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { setEverythingInApp } from './app-consent'

describe('setEverythingInApp', () => {
  beforeEach(() => {
    rpc.mockReset()
    upsert.mockReset()
    getUser.mockReset()
    getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
  })

  it('refuses a visitor with no session, writing nothing', async () => {
    getUser.mockResolvedValue({ data: { user: null } })
    const result = await setEverythingInApp(true)
    expect(result.ok).toBe(false)
    expect(rpc).not.toHaveBeenCalled()
    expect(upsert).not.toHaveBeenCalled()
  })

  it('records the consent first, then writes the preferences', async () => {
    const order: string[] = []
    rpc.mockImplementation(async () => {
      order.push('consent')
      return { error: null }
    })
    upsert.mockImplementation(async () => {
      order.push('prefs')
      return { error: null }
    })
    const result = await setEverythingInApp(true, 'account_page')
    expect(result).toEqual({ ok: true, on: true })
    expect(order).toEqual(['consent', 'prefs'])
    const args = rpc.mock.calls[0]?.[1] as Record<string, unknown>
    expect(args.p_action).toBe('opt_in')
    expect(args.p_source).toBe('account_page')
    expect(args.p_ip).toBe('203.0.113.9')
    expect(args).not.toHaveProperty('p_user_id')
  })

  it('does not touch the preferences when the consent cannot be recorded', async () => {
    rpc.mockResolvedValue({ error: { code: 'PGRST202', message: 'no function' } })
    const result = await setEverythingInApp(true)
    expect(result.ok).toBe(false)
    expect(upsert).not.toHaveBeenCalled()
  })

  it('records an opt-out and switches the same rows off', async () => {
    rpc.mockResolvedValue({ error: null })
    upsert.mockResolvedValue({ error: null })
    await setEverythingInApp(false)
    expect((rpc.mock.calls[0]?.[1] as Record<string, unknown>).p_action).toBe('opt_out')
    const rows = upsert.mock.calls[0]?.[0] as { enabled: boolean; channel: string }[]
    expect(rows.every((r) => r.enabled === false)).toBe(true)
    expect(rows.some((r) => r.channel === 'email')).toBe(false)
  })
})
