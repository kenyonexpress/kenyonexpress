import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The CSP opens for PostHog exactly when there is a PostHog key, and for the
 * host the key is used against.
 *
 * Measured 2026-10-05 (W11): with a key set and consent granted, the browser
 * refused every `/capture/` request against our own `connect-src`, and zero
 * events left the page. The server half of the funnel was unaffected, which is
 * the dangerous shape: conversions with no visitors looks like a tracking
 * misconfiguration on PostHog's side, not ours.
 *
 * Same module-load trap as `csp-turnstile.test.ts`: the key is read once, so
 * each case re-imports under a fresh registry.
 */

const KEY = 'NEXT_PUBLIC_POSTHOG_KEY'
const HOST = 'NEXT_PUBLIC_POSTHOG_HOST'
const saved = { key: process.env[KEY], host: process.env[HOST] }

beforeEach(() => {
  vi.resetModules()
  delete process.env[KEY]
  delete process.env[HOST]
})

afterEach(() => {
  if (saved.key === undefined) delete process.env[KEY]
  else process.env[KEY] = saved.key
  if (saved.host === undefined) delete process.env[HOST]
  else process.env[HOST] = saved.host
})

async function directives(): Promise<Record<string, string>> {
  const module = await import('@/lib/security/frame-policy')
  const csp = module.contentSecurityPolicyFor('/')
  return Object.fromEntries(csp.split('; ').map((d) => [d.split(' ')[0], d]))
}

describe('CSP and PostHog', () => {
  it('names no PostHog host without a key', async () => {
    const d = await directives()
    expect(d['connect-src']).not.toContain('posthog')
    expect(d['script-src']).not.toContain('posthog')
    expect(d['connect-src']).toBe("connect-src 'self' https://*.supabase.co wss://*.supabase.co")
  })

  it('opens connect-src and script-src for the US cloud and its assets host by default', async () => {
    process.env[KEY] = 'phc_test'
    const d = await directives()
    for (const directive of ['connect-src', 'script-src']) {
      expect(d[directive]).toContain('https://us.i.posthog.com')
      expect(d[directive]).toContain('https://us-assets.i.posthog.com')
    }
  })

  it('follows the configured host, so an EU project gets the EU pair', async () => {
    process.env[KEY] = 'phc_test'
    process.env[HOST] = 'https://eu.i.posthog.com/'
    const d = await directives()
    expect(d['connect-src']).toContain('https://eu.i.posthog.com')
    expect(d['connect-src']).toContain('https://eu-assets.i.posthog.com')
    expect(d['connect-src']).not.toContain('us.i.posthog.com')
  })

  it('grants the origin only for a self-hosted or local host, never a path', async () => {
    process.env[KEY] = 'phc_test'
    process.env[HOST] = 'http://localhost:4871/capture'
    const d = await directives()
    expect(d['connect-src']).toContain(' http://localhost:4871')
    expect(d['connect-src']).not.toContain('localhost:4871/')
    expect(d['connect-src']).not.toContain('assets')
  })

  it('opens nothing for an unparseable host rather than a mangled grant', async () => {
    process.env[KEY] = 'phc_test'
    process.env[HOST] = 'not a url'
    const d = await directives()
    expect(d['connect-src']).not.toContain('posthog')
    expect(d['connect-src']).not.toContain('not')
  })

  it('leaves default-src, style-src, img-src and frame-src alone', async () => {
    process.env[KEY] = 'phc_test'
    const d = await directives()
    for (const directive of ['default-src', 'style-src', 'img-src', 'frame-src']) {
      expect(d[directive]).not.toContain('posthog')
    }
  })
})
