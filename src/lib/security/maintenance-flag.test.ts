import { beforeEach, describe, expect, it, vi } from 'vitest'
import { __resetMaintenanceFlagCache, maintenanceFlagOn } from './maintenance-flag'

const env = {
  NEXT_PUBLIC_SUPABASE_URL: 'https://x.supabase.co',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon',
} as unknown as NodeJS.ProcessEnv
const reply = (value: boolean | null) =>
  vi.fn(async () => new Response(JSON.stringify([{ bool_value: value }]), { status: 200 }))

describe('maintenanceFlagOn', () => {
  beforeEach(() => __resetMaintenanceFlagCache())

  it('reads the flag and caches it for 30 seconds', async () => {
    const f = reply(true)
    expect(await maintenanceFlagOn(1_000, env, f as unknown as typeof fetch)).toBe(true)
    expect(await maintenanceFlagOn(20_000, env, f as unknown as typeof fetch)).toBe(true)
    expect(f).toHaveBeenCalledTimes(1)
  })

  it('fails open: an error with nothing cached reads as off', async () => {
    const f = vi.fn(async () => {
      throw new Error('down')
    })
    expect(await maintenanceFlagOn(1_000, env, f as unknown as typeof fetch)).toBe(false)
  })

  it('keeps the last known value through an error', async () => {
    expect(await maintenanceFlagOn(1_000, env, reply(true) as unknown as typeof fetch)).toBe(true)
    const broken = vi.fn(async () => new Response('x', { status: 500 }))
    expect(await maintenanceFlagOn(40_000, env, broken as unknown as typeof fetch)).toBe(true)
  })
})
