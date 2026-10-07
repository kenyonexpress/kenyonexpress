import { describe, expect, it } from 'vitest'
import {
  blockedInlineScripts,
  directiveSources,
  isExecutable,
  nonceOf,
  scriptTags,
  sha256Source,
} from './csp-html.mjs'
import { auditResponse } from './csp-probe.mjs'

const NONCE = 'abc123+/='
const CONSENT = '(function(){try{document.documentElement.setAttribute("x","y")}catch(e){}})()'
const CONSENT_HASH = sha256Source(CONSENT)

const page = (scripts) => `<!DOCTYPE html><html><head></head><body>${scripts}</body></html>`

describe('scriptTags', () => {
  it('reads attributes in any quoting and the body', () => {
    const tags = scriptTags(
      `<script src="/a.js" async="" crossorigin=""></script><script nonce='${NONCE}'>x()</script><script type=module>y()</script>`,
    )
    expect(tags).toHaveLength(3)
    expect(tags[0].attrs).toEqual({ src: '/a.js', async: '', crossorigin: '' })
    expect(tags[1].attrs.nonce).toBe(NONCE)
    expect(tags[1].body).toBe('x()')
    expect(tags[2].attrs.type).toBe('module')
  })
})

describe('isExecutable', () => {
  it('counts plain, module and javascript types, not data blocks', () => {
    expect(isExecutable({ attrs: {}, body: '' })).toBe(true)
    expect(isExecutable({ attrs: { type: 'module' }, body: '' })).toBe(true)
    expect(isExecutable({ attrs: { type: 'text/javascript' }, body: '' })).toBe(true)
    expect(isExecutable({ attrs: { type: 'application/ld+json' }, body: '' })).toBe(false)
    expect(isExecutable({ attrs: { type: 'application/json' }, body: '' })).toBe(false)
  })
})

describe('policy parsing', () => {
  const csp = `default-src 'self'; script-src 'self' 'nonce-${NONCE}' '${CONSENT_HASH}'; frame-ancestors 'none'`
  it('finds the nonce and the sources', () => {
    expect(nonceOf(csp)).toBe(NONCE)
    expect(directiveSources(csp, 'script-src')).toEqual([
      "'self'",
      `'nonce-${NONCE}'`,
      `'${CONSENT_HASH}'`,
    ])
    expect(directiveSources(csp, 'worker-src')).toBeNull()
    expect(nonceOf("script-src 'self'")).toBeNull()
  })
})

describe('blockedInlineScripts', () => {
  it('passes nonced scripts, hashed constants and data blocks', () => {
    const html = page(
      `<script>${CONSENT}</script><script nonce="${NONCE}">self.__next_f.push([1])</script><script type="application/ld+json">{"a":1}</script><script src="/x.js"></script>`,
    )
    expect(blockedInlineScripts(html, { nonce: NONCE, hashes: [CONSENT_HASH] })).toEqual([])
  })

  it('reports a nonce-less inline script whose hash is unknown, and a wrong nonce', () => {
    const html = page(
      `<script>evil()</script><script nonce="other">self.__next_f.push([1])</script>`,
    )
    const blocked = blockedInlineScripts(html, { nonce: NONCE, hashes: [CONSENT_HASH] })
    expect(blocked).toHaveLength(2)
    expect(blocked[0]).toMatchObject({ hash: sha256Source('evil()'), nonce: null })
    expect(blocked[1]).toMatchObject({ nonce: 'other' })
  })

  it('with no nonce (a prerendered shell), only the hashes can pass', () => {
    const html = page(`<script>${CONSENT}</script><script>self.__next_f.push([1])</script>`)
    const blocked = blockedInlineScripts(html, { nonce: null, hashes: [CONSENT_HASH] })
    expect(blocked.map((b) => b.preview)).toEqual(['self.__next_f.push([1])'])
  })
})

describe('auditResponse', () => {
  const headers = (csp, extra = {}) =>
    new Headers({
      'content-security-policy': csp,
      'strict-transport-security': 'max-age=63072000; includeSubDomains; preload',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'strict-origin',
      'x-frame-options': 'DENY',
      'permissions-policy': 'camera=(), microphone=()',
      ...extra,
    })
  const good = `default-src 'self'; script-src 'self' 'nonce-${NONCE}' '${CONSENT_HASH}' https://www.googletagmanager.com; frame-ancestors 'none'`

  it('is clean for a page whose scripts all satisfy the policy', () => {
    const html = page(
      `<script>${CONSENT}</script><script nonce="${NONCE}">a()</script><script src="/_next/static/c.js" async=""></script><script src="https://www.googletagmanager.com/gtag/js?id=G-1" nonce="${NONCE}"></script>`,
    )
    expect(auditResponse({ url: 'https://shop.example/', headers: headers(good), html })).toEqual(
      [],
    )
  })

  it('reports unsafe-inline, strict-dynamic, a foreign script host and a wrong header', () => {
    const csp = `script-src 'self' 'unsafe-inline' 'strict-dynamic' 'nonce-${NONCE}'; frame-ancestors 'none'`
    const html = page(`<script src="https://evil.example/x.js"></script>`)
    const findings = auditResponse({
      url: 'https://shop.example/',
      headers: headers(csp, { 'referrer-policy': 'no-referrer-when-downgrade' }),
      html,
    })
    expect(findings.some((f) => f.includes("'unsafe-inline'"))).toBe(true)
    expect(findings.some((f) => f.includes("'strict-dynamic'"))).toBe(true)
    expect(findings.some((f) => f.includes('https://evil.example'))).toBe(true)
    expect(findings.some((f) => f.includes('referrer-policy'))).toBe(true)
  })

  it('reports a missing policy as the only finding', () => {
    expect(
      auditResponse({ url: 'https://shop.example/', headers: new Headers(), html: '' }),
    ).toEqual(['https://shop.example/: no Content-Security-Policy header'])
  })
})
