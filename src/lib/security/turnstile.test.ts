import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const env = (v: Record<string, string>) => v as unknown as NodeJS.ProcessEnv

const mockLog = {
  warn: vi.fn(),
  info: vi.fn(),
  error: vi.fn(),
}

vi.mock('@/lib/observability/log', () => ({
  log: mockLog,
}))

let turnstileConfigured: typeof import('./turnstile').turnstileConfigured
let verifyTurnstile: typeof import('./turnstile').verifyTurnstile

beforeEach(async () => {
  vi.clearAllMocks()
  vi.resetModules()
  const mod = await import('./turnstile')
  turnstileConfigured = mod.turnstileConfigured
  verifyTurnstile = mod.verifyTurnstile
})

afterEach(() => {
  vi.unstubAllGlobals()
})

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
  it('logs warning once when TURNSTILE_SECRET_KEY is missing', async () => {
    // First call should log
    await verifyTurnstile(null, '1.2.3.4', env({}))
    expect(mockLog.warn).toHaveBeenCalledTimes(1)
    expect(mockLog.warn).toHaveBeenCalledWith('turnstile.env_missing', {
      message: 'TURNSTILE_SECRET_KEY not set, verification skipped. See docs/TURNSTILE-SETUP.md',
    })

    // Second call should not log again (one-time warning)
    await verifyTurnstile(null, '1.2.3.5', env({}))
    expect(mockLog.warn).toHaveBeenCalledTimes(1) // Still 1, not 2
  })
  it('does not log when TURNSTILE_SECRET_KEY is set', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ success: true }), { status: 200 })),
    )

    await verifyTurnstile('token', '1.2.3.4', env({ TURNSTILE_SECRET_KEY: 'test-secret' }))
    expect(mockLog.warn).not.toHaveBeenCalled()
  })
})
