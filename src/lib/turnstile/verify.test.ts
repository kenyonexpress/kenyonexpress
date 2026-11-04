import {
  TURNSTILE_FIELD,
  TURNSTILE_PASS_TTL_SECONDS,
  checkTurnstilePass,
  issueTurnstilePass,
  verifyTurnstileForm,
} from '@/lib/turnstile/verify'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/observability/log', () => ({
  log: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}))

const CONFIGURED = {
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: '1x00000000000000000000AA',
  TURNSTILE_SECRET_KEY: '1x0000000000000000000000000000000AA',
} as unknown as NodeJS.ProcessEnv
const UNCONFIGURED = {} as NodeJS.ProcessEnv
const REFUSAL = 'אימות האבטחה נכשל. רעננו את העמוד ונסו שוב.'

function formWith(token?: string): FormData {
  const data = new FormData()
  data.set('email', 'dani@example.com')
  if (token !== undefined) data.set(TURNSTILE_FIELD, token)
  return data
}

function stubSiteverify(payload: unknown) {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify(payload), { status: 200 }))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('verifyTurnstileForm', () => {
  it('allows without calling Cloudflare when no key pair is configured', async () => {
    const fetchMock = stubSiteverify({ success: false })
    expect(await verifyTurnstileForm(formWith(), '1.2.3.4', UNCONFIGURED)).toEqual({ ok: true })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('refuses a form with no token when configured, without a round trip', async () => {
    const fetchMock = stubSiteverify({ success: true })
    expect(await verifyTurnstileForm(formWith(), '1.2.3.4', CONFIGURED)).toEqual({
      ok: false,
      error: REFUSAL,
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('refuses a token Cloudflare rejects', async () => {
    stubSiteverify({ success: false, 'error-codes': ['invalid-input-response'] })
    expect(await verifyTurnstileForm(formWith('bad'), '1.2.3.4', CONFIGURED)).toEqual({
      ok: false,
      error: REFUSAL,
    })
  })

  it('accepts a token Cloudflare accepts, and sends the field and the client address', async () => {
    const fetchMock = stubSiteverify({ success: true })
    expect(await verifyTurnstileForm(formWith('good'), '203.0.113.9', CONFIGURED)).toEqual({
      ok: true,
    })
    const body = (fetchMock.mock.calls[0] as unknown as [string, { body: URLSearchParams }])[1].body
    expect(body.get('response')).toBe('good')
    expect(body.get('remoteip')).toBe('203.0.113.9')
    expect(body.get('secret')).toBe(CONFIGURED.TURNSTILE_SECRET_KEY)
  })

  it('reads a File in the field as no token, not as a string', async () => {
    const data = new FormData()
    data.set(TURNSTILE_FIELD, new File(['x'], 'x.txt'))
    expect((await verifyTurnstileForm(data, undefined, CONFIGURED)).ok).toBe(false)
  })
})

describe('the supplier-apply pass', () => {
  const NOW = Date.UTC(2026, 10, 4, 12, 0, 0)

  it('issues nothing and checks true when unconfigured', () => {
    expect(issueTurnstilePass('user-1', NOW, UNCONFIGURED)).toBeNull()
    expect(checkTurnstilePass(undefined, 'user-1', NOW, UNCONFIGURED)).toBe(true)
  })

  it('round-trips for the same user inside the TTL', () => {
    const pass = issueTurnstilePass('user-1', NOW, CONFIGURED)
    expect(pass).toMatch(/^user-1\.\d+\.[\w-]+$/)
    expect(checkTurnstilePass(pass, 'user-1', NOW + 60_000, CONFIGURED)).toBe(true)
  })

  it('is refused when absent, for another user, or expired', () => {
    const pass = issueTurnstilePass('user-1', NOW, CONFIGURED)
    expect(checkTurnstilePass(undefined, 'user-1', NOW, CONFIGURED)).toBe(false)
    expect(checkTurnstilePass(pass, 'user-2', NOW, CONFIGURED)).toBe(false)
    expect(
      checkTurnstilePass(pass, 'user-1', NOW + TURNSTILE_PASS_TTL_SECONDS * 1000, CONFIGURED),
    ).toBe(false)
  })

  it('is refused when tampered with or signed under another secret', () => {
    const pass = issueTurnstilePass('user-1', NOW, CONFIGURED) as string
    const [subject, expires, mac] = pass.split('.') as [string, string, string]
    // A later expiry with the old MAC.
    expect(
      checkTurnstilePass(`${subject}.${Number(expires) + 3600}.${mac}`, 'user-1', NOW, CONFIGURED),
    ).toBe(false)
    expect(
      checkTurnstilePass(`${subject}.${expires}.${mac.slice(1)}`, 'user-1', NOW, CONFIGURED),
    ).toBe(false)
    expect(checkTurnstilePass('user-1.garbage', 'user-1', NOW, CONFIGURED)).toBe(false)
    const rotated = { ...CONFIGURED, TURNSTILE_SECRET_KEY: 'rotated-secret' } as NodeJS.ProcessEnv
    expect(checkTurnstilePass(pass, 'user-1', NOW, rotated)).toBe(false)
  })
})
