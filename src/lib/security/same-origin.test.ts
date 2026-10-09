import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  CROSS_SITE_REJECTION,
  isCrossSiteApiMutation,
  isMutatingMethod,
  requestHosts,
  requestSite,
} from './same-origin'

const OURS = 'kenyonexpress.co.il'

function headers(init: Record<string, string>): Headers {
  return new Headers(init)
}

describe('isMutatingMethod', () => {
  it('treats GET, HEAD and OPTIONS as safe, in any case', () => {
    for (const m of ['GET', 'get', 'HEAD', 'OPTIONS', undefined, null]) {
      expect(isMutatingMethod(m)).toBe(false)
    }
  })

  it('treats everything else as a write', () => {
    for (const m of ['POST', 'PUT', 'PATCH', 'DELETE', 'post', 'PROPFIND']) {
      expect(isMutatingMethod(m)).toBe(true)
    }
  })
})

describe('requestHosts', () => {
  it('collects the URL host, Host and every x-forwarded-host, lower-cased', () => {
    const hosts = requestHosts(
      headers({ host: 'KenyonExpress.co.il', 'x-forwarded-host': 'a.vercel.app, b.vercel.app' }),
      'kenyonexpress.co.il',
    )
    expect([...hosts].sort()).toEqual(['a.vercel.app', 'b.vercel.app', 'kenyonexpress.co.il'])
  })

  it('never yields an empty host', () => {
    expect([...requestHosts(headers({ host: ' , ' }), '')]).toEqual([])
  })
})

describe('requestSite: Sec-Fetch-Site wins when present', () => {
  it.each(['same-origin', 'none', 'Same-Origin'])('%s is ours', (value) => {
    // The Origin header disagrees on purpose: the fetch-metadata header is
    // browser-set and cannot be forged, so it outranks the rest.
    expect(
      requestSite(headers({ 'sec-fetch-site': value, origin: 'https://evil.example' }), OURS),
    ).toBe('same-origin')
  })

  it.each(['cross-site', 'same-site'])('%s is foreign, even with a matching Origin', (value) => {
    expect(requestSite(headers({ 'sec-fetch-site': value, origin: `https://${OURS}` }), OURS)).toBe(
      'cross-site',
    )
  })

  it('an unknown value falls through to the Origin check', () => {
    expect(
      requestSite(headers({ 'sec-fetch-site': 'weird', origin: `https://${OURS}` }), OURS),
    ).toBe('same-origin')
  })
})

describe('requestSite: Origin', () => {
  it('matches by host, on any of the hosts the request is addressed to', () => {
    expect(requestSite(headers({ origin: `https://${OURS}` }), OURS)).toBe('same-origin')
    expect(
      requestSite(
        headers({ origin: 'https://preview.vercel.app', 'x-forwarded-host': 'preview.vercel.app' }),
        OURS,
      ),
    ).toBe('same-origin')
  })

  it('a foreign host is cross-site', () => {
    expect(requestSite(headers({ origin: 'https://evil.example' }), OURS)).toBe('cross-site')
    // A lookalike that merely ends in our name.
    expect(requestSite(headers({ origin: `https://${OURS}.evil.example` }), OURS)).toBe(
      'cross-site',
    )
    expect(requestSite(headers({ origin: `https://evil-${OURS}` }), OURS)).toBe('cross-site')
  })

  it('"null" and garbage are cross-site, not unknown', () => {
    expect(requestSite(headers({ origin: 'null' }), OURS)).toBe('cross-site')
    expect(requestSite(headers({ origin: 'not a url' }), OURS)).toBe('cross-site')
  })

  it('a different port is a different origin', () => {
    expect(requestSite(headers({ origin: 'http://localhost:3000' }), 'localhost:3311')).toBe(
      'cross-site',
    )
    expect(requestSite(headers({ origin: 'http://localhost:3311' }), 'localhost:3311')).toBe(
      'same-origin',
    )
  })
})

describe('requestSite: Referer, then nothing', () => {
  it('uses Referer only when Origin is absent', () => {
    expect(requestSite(headers({ referer: `https://${OURS}/cart` }), OURS)).toBe('same-origin')
    expect(requestSite(headers({ referer: 'https://evil.example/' }), OURS)).toBe('cross-site')
    expect(
      requestSite(headers({ origin: 'https://evil.example', referer: `https://${OURS}/` }), OURS),
    ).toBe('cross-site')
  })

  it('with no browser header at all, says so rather than guessing', () => {
    // A Cardcom callback, a QStash delivery, the till app: a secret or a
    // bearer token authenticates these, and a cookie never does.
    expect(requestSite(headers({ authorization: 'Bearer x' }), OURS)).toBe('no-browser-context')
  })
})

describe('isCrossSiteApiMutation', () => {
  const req = (method: string, pathname: string, h: Record<string, string>) => ({
    method,
    headers: headers(h),
    nextUrl: { pathname, host: OURS },
  })

  it('rejects a cross-site POST to a route handler', () => {
    expect(
      isCrossSiteApiMutation(
        req('POST', '/api/account/export', { origin: 'https://evil.example' }),
      ),
    ).toBe(true)
    expect(
      isCrossSiteApiMutation(
        req('DELETE', '/api/app/push-tokens', { 'sec-fetch-site': 'cross-site' }),
      ),
    ).toBe(true)
  })

  it('leaves reads alone, whoever sends them', () => {
    expect(
      isCrossSiteApiMutation(req('GET', '/api/cart', { origin: 'https://evil.example' })),
    ).toBe(false)
  })

  it('leaves pages alone: Server Actions have their own Origin check', () => {
    expect(
      isCrossSiteApiMutation(req('POST', '/checkout', { origin: 'https://evil.example' })),
    ).toBe(false)
    expect(isCrossSiteApiMutation(req('POST', '/apis', { origin: 'https://evil.example' }))).toBe(
      false,
    )
  })

  it('lets a same-origin write and a server-to-server write through', () => {
    expect(isCrossSiteApiMutation(req('POST', '/api/a', { 'sec-fetch-site': 'same-origin' }))).toBe(
      false,
    )
    expect(
      isCrossSiteApiMutation(
        req('POST', '/api/payments/cardcom/webhook', { 'content-type': 'application/json' }),
      ),
    ).toBe(false)
  })

  it('names the rejection in one word a client can match on', () => {
    expect(CROSS_SITE_REJECTION).toEqual({ ok: false, error: 'cross_site_request' })
  })
})

/**
 * The proxy is not unit-testable in isolation (it constructs a Supabase
 * client from the environment), so the wiring is pinned by shape: the gate is
 * called, it is called before the session refresh so a rejected request costs
 * no token round trip, and it answers 403 with the shared body.
 */
describe('src/proxy.ts wires the gate', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/proxy.ts'), 'utf8')

  it('imports and calls isCrossSiteApiMutation', () => {
    expect(source).toMatch(
      /import \{[^}]*isCrossSiteApiMutation[^}]*\} from '@\/lib\/security\/same-origin'/,
    )
    expect(source).toContain('isCrossSiteApiMutation(request)')
  })

  it('runs before the Supabase session refresh', () => {
    const gate = source.indexOf('isCrossSiteApiMutation(request)')
    const refresh = source.indexOf('} = await supabase.auth.getUser()')
    expect(gate).toBeGreaterThan(-1)
    expect(refresh).toBeGreaterThan(gate)
  })

  it('answers 403 with the shared body', () => {
    expect(source).toMatch(/CROSS_SITE_REJECTION[\s\S]{0,120}status: 403/)
  })
})
