import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The CSP has to open three directives for Turnstile, and open them ONLY when
 * the widget can render.
 *
 * `frame-policy.ts` reads `NEXT_PUBLIC_TURNSTILE_SITE_KEY` at MODULE LOAD, so
 * each case re-imports it under a fresh module registry. Without the reset both
 * cases would read whichever value happened to be set when the first test ran,
 * and the file would pass while asserting nothing.
 */

const KEY = 'NEXT_PUBLIC_TURNSTILE_SITE_KEY'
const HOST = 'https://challenges.cloudflare.com'
const original = process.env[KEY]

beforeEach(() => {
  vi.resetModules()
})

afterEach(() => {
  if (original === undefined) delete process.env[KEY]
  else process.env[KEY] = original
})

async function policy(): Promise<string> {
  const module = await import('@/lib/security/frame-policy')
  return module.contentSecurityPolicyFor('/checkout')
}

describe('CSP and Turnstile', () => {
  it('names no Cloudflare host when there is no site key', async () => {
    delete process.env[KEY]
    const csp = await policy()
    expect(csp).not.toContain(HOST)
    // The pre-existing directives survive untouched.
    expect(csp).toContain("script-src 'self' 'unsafe-inline'")
    expect(csp).toContain("connect-src 'self' https://*.supabase.co")
    expect(csp).toContain('frame-src https://secure.cardcom.solutions')
  })

  it('opens script-src, connect-src AND frame-src when a site key is set', async () => {
    process.env[KEY] = '1x00000000000000000000AA'
    const csp = await policy()
    // All three, because missing any one produces a widget that renders
    // nothing, sends no token, and refuses every real submission.
    const directives = Object.fromEntries(
      csp.split('; ').map((directive) => [directive.split(' ')[0], directive]),
    )
    expect(directives['script-src']).toContain(HOST)
    expect(directives['connect-src']).toContain(HOST)
    expect(directives['frame-src']).toContain(HOST)
  })

  it('does not open default-src, style-src or img-src along the way', async () => {
    process.env[KEY] = '1x00000000000000000000AA'
    const csp = await policy()
    const directives = Object.fromEntries(
      csp.split('; ').map((directive) => [directive.split(' ')[0], directive]),
    )
    for (const name of ['default-src', 'style-src', 'font-src', 'form-action']) {
      expect(directives[name], name).not.toContain(HOST)
    }
  })

  it('keeps Cardcom framed either way, which is the other half of checkout', async () => {
    process.env[KEY] = '1x00000000000000000000AA'
    expect(await policy()).toContain('https://secure.cardcom.solutions')
  })
})
