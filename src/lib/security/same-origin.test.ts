import { describe, expect, it } from 'vitest'
import { isSameOriginRequest, requestHost } from './same-origin'

const post = (headers: Record<string, string>, body = '{}') =>
  new Request('https://kenyonexpress.vercel.app/api/anything', {
    method: 'POST',
    headers,
    body,
  })

describe('what makes a request cross-origin', () => {
  it('allows a request with no Origin at all, which is what the app sends', () => {
    // React Native's fetch sends no Origin: there is no page and no CORS. Four
    // of the guarded routes are called that way, so refusing this would break
    // the till app and buy nothing - the attack being defended against is a
    // browser, and a browser always sends Origin on a POST.
    expect(isSameOriginRequest(post({ host: 'kenyonexpress.co.il' }))).toBe(true)
  })

  it('allows our own origin', () => {
    expect(
      isSameOriginRequest(
        post({ host: 'www.kenyonexpress.co.il', origin: 'https://www.kenyonexpress.co.il' }),
      ),
    ).toBe(true)
  })

  it('refuses another origin', () => {
    expect(
      isSameOriginRequest(
        post({ host: 'www.kenyonexpress.co.il', origin: 'https://evil.example' }),
      ),
    ).toBe(false)
  })

  it('refuses a SIBLING SUBDOMAIN, which is the case SameSite=Lax lets through', () => {
    // This is the whole reason the file exists. Lax is a site rule: a POST from
    // blog.kenyonexpress.co.il to www.kenyonexpress.co.il is same-site, so the
    // session cookie rides along and no preflight is required.
    expect(
      isSameOriginRequest(
        post({ host: 'www.kenyonexpress.co.il', origin: 'https://blog.kenyonexpress.co.il' }),
      ),
    ).toBe(false)
  })

  it('refuses a literal null origin, which is a sandboxed frame rather than the app', () => {
    expect(isSameOriginRequest(post({ host: 'www.kenyonexpress.co.il', origin: 'null' }))).toBe(
      false,
    )
  })

  it('prefers x-forwarded-host, because on Vercel the URL host can be the deployment', () => {
    // Comparing an Origin of www.kenyonexpress.co.il against a *.vercel.app
    // deployment hostname would refuse every legitimate request on the domain.
    const request = new Request('https://kenyonexpress-abc123.vercel.app/api/anything', {
      method: 'POST',
      headers: {
        host: 'kenyonexpress-abc123.vercel.app',
        'x-forwarded-host': 'www.kenyonexpress.co.il',
        origin: 'https://www.kenyonexpress.co.il',
      },
    })
    expect(requestHost(request)).toBe('www.kenyonexpress.co.il')
    expect(isSameOriginRequest(request)).toBe(true)
  })

  it('takes the first host when the edge appends to x-forwarded-host', () => {
    expect(requestHost(post({ 'x-forwarded-host': 'a.example, b.example' }))).toBe('a.example')
  })
})

describe('why an unprotected POST route is reachable cross-site at all', () => {
  it('parses a JSON body sent as text/plain, which needs no CORS preflight', async () => {
    // MEASURED, not assumed. A cross-origin fetch with an application/json
    // content type triggers a preflight the browser will not get past, so a
    // route that only accepted real JSON would be unreachable. But `.json()`
    // ignores the content type entirely: text/plain makes the POST a SIMPLE
    // request that is sent without any preflight, and the handler still parses
    // it. That is why the guard has to be in the handler and cannot be inferred
    // from the fact that a route reads JSON.
    const request = post({ 'content-type': 'text/plain;charset=UTF-8' }, '{"code":"ABC123"}')
    await expect(request.json()).resolves.toEqual({ code: 'ABC123' })
  })
})
