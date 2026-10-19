import { afterEach, describe, expect, it, vi } from 'vitest'
import { turnstileConfigured, verifyTurnstile } from './turnstile'

const env = (v: Record<string, string>) => v as unknown as NodeJS.ProcessEnv

afterEach(() => vi.unstubAllGlobals())

describe('turnstile', () => {
  it('passes when no secret is configured', async () => {
    expect(turnstileConfigured(env({}))).toBe(false)
    expect(await verifyTurnstile(null, '1.2.3.4', env({}))).toBe(true)
  })
  it('fails closed on a missing token once configured', async () => {
    expect(await verifyTurnstile(null, undefined, env({ TURNSTILE_SECRET_KEY: 's' }))).toBe(false)
    expect(await verifyTurnstile('', undefined, env({ TURNSTILE_SECRET_KEY: 's' }))).toBe(false)
  })
  it('accepts only an explicit success', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ success: true }), { status: 200 })),
    )
    expect(await verifyTurnstile('tok', '1.2.3.4', env({ TURNSTILE_SECRET_KEY: 's' }))).toBe(true)
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ success: false }), { status: 200 })),
    )
    expect(await verifyTurnstile('tok', undefined, env({ TURNSTILE_SECRET_KEY: 's' }))).toBe(false)
  })
  it('fails closed when the verifier is unreachable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('down')
      }),
    )
    expect(await verifyTurnstile('tok', undefined, env({ TURNSTILE_SECRET_KEY: 's' }))).toBe(false)
  })
})
