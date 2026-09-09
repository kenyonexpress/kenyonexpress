import { turnstileConfig, turnstileEnabled, verifyTurnstile } from '@/lib/fraud/turnstile'
import { afterEach, describe, expect, it, vi } from 'vitest'

const CONFIGURED = {
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: '1x00000000000000000000AA',
  TURNSTILE_SECRET_KEY: '1x0000000000000000000000000000000AA',
} as unknown as NodeJS.ProcessEnv

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('turnstileConfig', () => {
  it('needs BOTH halves, because one alone refuses every real person', () => {
    // The site key is what makes the widget render. With only the secret set,
    // no browser sends a token and every submission fails the challenge.
    expect(turnstileConfig({} as NodeJS.ProcessEnv)).toBeNull()
    expect(
      turnstileConfig({ TURNSTILE_SECRET_KEY: 'secret' } as unknown as NodeJS.ProcessEnv),
    ).toBeNull()
    expect(
      turnstileConfig({
        NEXT_PUBLIC_TURNSTILE_SITE_KEY: 'site',
      } as unknown as NodeJS.ProcessEnv),
    ).toBeNull()
    expect(turnstileConfig(CONFIGURED)).toEqual({
      siteKey: CONFIGURED.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
      secretKey: CONFIGURED.TURNSTILE_SECRET_KEY,
    })
  })

  it('treats whitespace as absent, so a blank line in an env file is not a config', () => {
    expect(
      turnstileConfig({
        NEXT_PUBLIC_TURNSTILE_SITE_KEY: '   ',
        TURNSTILE_SECRET_KEY: 'secret',
      } as unknown as NodeJS.ProcessEnv),
    ).toBeNull()
  })

  it('turnstileEnabled agrees with it', () => {
    expect(turnstileEnabled({} as NodeJS.ProcessEnv)).toBe(false)
    expect(turnstileEnabled(CONFIGURED)).toBe(true)
  })
})

describe('verifyTurnstile', () => {
  it('ALLOWS and does not call out when unconfigured', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    // The fail-open. Without it, merging this branch takes down signup and
    // checkout in every environment that has no Turnstile, which is all of them.
    await expect(verifyTurnstile(null, '1.2.3.4', {} as NodeJS.ProcessEnv)).resolves.toEqual({
      ok: true,
      enforced: false,
    })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('refuses an empty token when configured, without spending a round trip', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const result = await verifyTurnstile('', '1.2.3.4', CONFIGURED)
    expect(result).toEqual({ ok: false, codes: ['missing-input-response'] })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('accepts a token Cloudflare confirms', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true }) }),
    )
    await expect(verifyTurnstile('good', '1.2.3.4', CONFIGURED)).resolves.toEqual({
      ok: true,
      enforced: true,
    })
  })

  it('refuses a token Cloudflare rejects, and carries the codes', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ success: false, 'error-codes': ['invalid-input-response'] }),
      }),
    )
    await expect(verifyTurnstile('bad', '1.2.3.4', CONFIGURED)).resolves.toEqual({
      ok: false,
      codes: ['invalid-input-response'],
    })
  })

  it('ALLOWS when Cloudflare is unreachable, because a bot control is not an authorisation', async () => {
    // Failing closed here means one Cloudflare incident stops every purchase.
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')))
    await expect(verifyTurnstile('anything', '1.2.3.4', CONFIGURED)).resolves.toEqual({
      ok: true,
      enforced: false,
    })
  })

  it('allows on a non-200 from siteverify for the same reason', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 502 }))
    await expect(verifyTurnstile('anything', '1.2.3.4', CONFIGURED)).resolves.toEqual({
      ok: true,
      enforced: false,
    })
  })

  it('omits the placeholder address rather than sending "unknown" to Cloudflare', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true }) })
    vi.stubGlobal('fetch', fetchSpy)
    // `getClientIp` returns the literal 'unknown' with no proxy in front.
    await verifyTurnstile('token', 'unknown', CONFIGURED)
    const body = fetchSpy.mock.calls[0]?.[1]?.body as URLSearchParams
    expect(body.get('remoteip')).toBeNull()
    expect(body.get('secret')).toBe(CONFIGURED.TURNSTILE_SECRET_KEY)
    expect(body.get('response')).toBe('token')
  })

  it('sends a real address when it has one', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true }) })
    vi.stubGlobal('fetch', fetchSpy)
    await verifyTurnstile('token', '203.0.113.7', CONFIGURED)
    const body = fetchSpy.mock.calls[0]?.[1]?.body as URLSearchParams
    expect(body.get('remoteip')).toBe('203.0.113.7')
  })
})
