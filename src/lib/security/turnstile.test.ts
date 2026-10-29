import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const env = (v: Record<string, string>) => v as unknown as NodeJS.ProcessEnv
const ON = env({ TURNSTILE_SECRET_KEY: 's', NEXT_PUBLIC_TURNSTILE_SITE_KEY: 'k' })

const mockLog = {
  warn: vi.fn(),
  info: vi.fn(),
  error: vi.fn(),
}

vi.mock('@/lib/observability/log', () => ({
  log: mockLog,
}))

let turnstileEnabled: typeof import('./turnstile').turnstileEnabled
let verifyTurnstile: typeof import('./turnstile').verifyTurnstile

beforeEach(async () => {
  vi.clearAllMocks()
  vi.resetModules()
  const mod = await import('./turnstile')
  turnstileEnabled = mod.turnstileEnabled
  verifyTurnstile = mod.verifyTurnstile
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('turnstile', () => {
  it('passes when no secret is configured', async () => {
    expect(turnstileEnabled(env({}))).toBe(false)
    expect(await verifyTurnstile(null, '1.2.3.4', env({}))).toBe(true)
  })
  it('fails closed on a missing token once configured', async () => {
    expect(await verifyTurnstile(null, undefined, ON)).toBe(false)
    expect(await verifyTurnstile('', undefined, ON)).toBe(false)
  })
  it('accepts only an explicit success', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ success: true }), { status: 200 })),
    )
    expect(await verifyTurnstile('tok', '1.2.3.4', ON)).toBe(true)
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ success: false }), { status: 200 })),
    )
    expect(await verifyTurnstile('tok', undefined, ON)).toBe(false)
  })
  it('fails closed when the verifier is unreachable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('down')
      }),
    )
    expect(await verifyTurnstile('tok', undefined, ON)).toBe(false)
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

    await verifyTurnstile('token', '1.2.3.4', ON)
    expect(mockLog.warn).not.toHaveBeenCalled()
  })
  it('is on only when both keys are present', () => {
    expect(turnstileEnabled(ON)).toBe(true)
    expect(turnstileEnabled(env({ TURNSTILE_SECRET_KEY: 's' }))).toBe(false)
    expect(turnstileEnabled(env({ NEXT_PUBLIC_TURNSTILE_SITE_KEY: 'k' }))).toBe(false)
  })
  it('turnstile_enabled=0/false switches it off even with keys', async () => {
    const off = env({ ...ON, NEXT_PUBLIC_TURNSTILE_ENABLED: 'false' } as Record<string, string>)
    expect(turnstileEnabled(off)).toBe(false)
    expect(await verifyTurnstile(null, undefined, off)).toBe(true)
    expect(
      turnstileEnabled(
        env({ ...ON, NEXT_PUBLIC_TURNSTILE_ENABLED: '0' } as Record<string, string>),
      ),
    ).toBe(false)
    expect(
      turnstileEnabled(
        env({ ...ON, NEXT_PUBLIC_TURNSTILE_ENABLED: '1' } as Record<string, string>),
      ),
    ).toBe(true)
  })
  it('secret without site key keeps forms working (check skipped)', async () => {
    expect(await verifyTurnstile(null, undefined, env({ TURNSTILE_SECRET_KEY: 's' }))).toBe(true)
  })
  it('sends secret, token and ip to siteverify', async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ success: true }), { status: 200 }))
    vi.stubGlobal('fetch', f)
    await verifyTurnstile('tok', '1.2.3.4', ON)
    const init = (f.mock.calls[0] as unknown as [string, RequestInit])[1]
    const body = init.body as URLSearchParams
    expect(body.get('secret')).toBe('s')
    expect(body.get('response')).toBe('tok')
    expect(body.get('remoteip')).toBe('1.2.3.4')
  })
})
