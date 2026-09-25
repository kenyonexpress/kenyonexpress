import type { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { log } from './log'
import { getRequestContext } from './request-context'
import { REQUEST_ID_HEADER } from './request-id'
import { HIGH_VOLUME_ROUTES, controlFlowStatus, withRequestLog } from './with-request-log'

/** Only the parts of NextRequest the wrapper touches. */
function request(init: { id?: string; method?: string } = {}): NextRequest {
  const headers = new Headers()
  if (init.id) headers.set(REQUEST_ID_HEADER, init.id)
  return { headers, method: init.method ?? 'GET' } as unknown as NextRequest
}

describe('withRequestLog', () => {
  let errorLine: ReturnType<typeof vi.spyOn>
  let warnLine: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    errorLine = vi.spyOn(console, 'error').mockImplementation(() => {})
    warnLine = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('takes the id the proxy forwarded rather than minting a second one', async () => {
    let seen: string | undefined
    const handler = withRequestLog('/api/health', async () => {
      seen = getRequestContext()?.requestId
      return new Response(null, { status: 200 })
    })

    await handler(request({ id: 'proxy-minted' }))
    expect(seen).toBe('proxy-minted')
  })

  it('mints when the proxy did not run, so the id is never absent', async () => {
    let seen: string | undefined
    const handler = withRequestLog('/api/health', async () => {
      seen = getRequestContext()?.requestId
      return new Response(null, { status: 200 })
    })

    await handler(request())
    expect(seen).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('binds the route and method so a deep log line says where it came from', async () => {
    let seen: ReturnType<typeof getRequestContext>
    const handler = withRequestLog('/api/payments/cardcom/webhook', async () => {
      seen = getRequestContext()
      return new Response(null, { status: 200 })
    })

    await handler(request({ method: 'POST' }))
    expect(seen?.route).toBe('/api/payments/cardcom/webhook')
    expect(seen?.method).toBe('POST')
  })

  it('echoes the id on the response so a shopper can quote it', async () => {
    const handler = withRequestLog('/api/cart', async () => new Response(null, { status: 200 }))

    const response = await handler(request({ id: 'quote-me' }))
    expect(response.headers.get(REQUEST_ID_HEADER)).toBe('quote-me')
  })

  it('returns the handler response untouched otherwise', async () => {
    const body = JSON.stringify({ ok: true })
    const handler = withRequestLog(
      '/api/cart',
      async () => new Response(body, { status: 201, headers: { 'x-custom': 'kept' } }),
    )

    const response = await handler(request())
    expect(response.status).toBe(201)
    expect(response.headers.get('x-custom')).toBe('kept')
    expect(await response.text()).toBe(body)
  })

  it('does not break a route whose response headers are immutable', async () => {
    const frozen = new Response(null, { status: 200 })
    Object.defineProperty(frozen, 'headers', {
      value: {
        set() {
          throw new TypeError('immutable')
        },
      },
    })

    const handler = withRequestLog('/api/search', async () => frozen)
    await expect(handler(request())).resolves.toBe(frozen)
  })

  it('is quiet on success and loud on failure', async () => {
    const ok = withRequestLog('/api/a', async () => new Response(null, { status: 204 }))
    const bad = withRequestLog('/api/a', async () => new Response(null, { status: 400 }))
    const broken = withRequestLog('/api/a', async () => new Response(null, { status: 500 }))

    await ok(request())
    expect(warnLine).not.toHaveBeenCalled()
    expect(errorLine).not.toHaveBeenCalled()

    await bad(request())
    expect(warnLine).toHaveBeenCalledTimes(1)

    await broken(request())
    expect(errorLine).toHaveBeenCalledTimes(1)
    expect(JSON.parse((errorLine.mock.calls[0] as [string])[0]).status).toBe(500)
  })

  it('logs a throw and re-throws it, so onRequestError still alerts', async () => {
    const handler = withRequestLog('/api/payments/cardcom/webhook', async () => {
      throw new Error('finalize exploded')
    })

    await expect(handler(request({ id: 'trace-1' }))).rejects.toThrow('finalize exploded')

    const line = JSON.parse((errorLine.mock.calls[0] as [string])[0])
    expect(line.event).toBe('request.failed')
    expect(line.request_id).toBe('trace-1')
    expect(line.err.message).toBe('finalize exploded')
  })

  it('logs a thrown redirect() as the 3xx it becomes, never as a failure', async () => {
    // Route handlers redirect by throwing; Next catches the digest above this
    // wrapper and answers 307. The route audit of 25.09 found every gated CSV
    // export writing an error-level request.failed with a stack for each
    // anonymous visit, which is the line an on-call reader would page on.
    const digest = 'NEXT_REDIRECT;replace;/login;307;'
    const handler = withRequestLog('/api/admin/audit-log/csv', async () => {
      throw Object.assign(new Error('NEXT_REDIRECT'), { digest })
    })

    await expect(handler(request({ id: 'trace-2' }))).rejects.toMatchObject({ digest })

    expect(errorLine).not.toHaveBeenCalled()
    expect(warnLine).not.toHaveBeenCalled()
    const infoLines = vi.mocked(console.log).mock.calls.map((c) => JSON.parse(c[0] as string))
    const completed = infoLines.find((line) => line.event === 'request.completed')
    expect(completed).toMatchObject({ status: 307, request_id: 'trace-2' })
  })

  it('logs a thrown notFound() as a 404 at warn, like a returned 404', async () => {
    const digest = 'NEXT_HTTP_ERROR_FALLBACK;404'
    const handler = withRequestLog('/api/a', async () => {
      throw Object.assign(new Error('NEXT_HTTP_ERROR_FALLBACK'), { digest })
    })

    await expect(handler(request())).rejects.toMatchObject({ digest })

    expect(errorLine).not.toHaveBeenCalled()
    expect(warnLine).toHaveBeenCalledTimes(1)
    const line = JSON.parse((warnLine.mock.calls[0] as [string])[0])
    expect(line).toMatchObject({ event: 'request.completed', status: 404 })
  })

  it('keeps one request id per request under concurrency', async () => {
    // The failure this guards against is a module-level variable instead of
    // async local storage: it passes every serial test and interleaves ids the
    // moment two requests overlap.
    const seen: string[] = []
    const handler = withRequestLog('/api/search', async () => {
      const id = getRequestContext()?.requestId ?? 'none'
      await new Promise((resolve) => setTimeout(resolve, 5))
      seen.push(`${id}|${getRequestContext()?.requestId ?? 'none'}`)
      return new Response(null, { status: 200 })
    })

    await Promise.all([
      handler(request({ id: 'first' })),
      handler(request({ id: 'second' })),
      handler(request({ id: 'third' })),
    ])

    expect(seen.sort()).toEqual(['first|first', 'second|second', 'third|third'])
  })

  it('leaves no context behind for whatever runs next', async () => {
    const handler = withRequestLog('/api/health', async () => new Response(null, { status: 200 }))
    await handler(request({ id: 'scoped' }))

    expect(getRequestContext()).toBeUndefined()
    log.error('after.request', {})
    expect(JSON.parse((errorLine.mock.calls[0] as [string])[0]).request_id).toBeNull()
  })
})

/**
 * The level the 2xx completion line is written at, which decides whether the
 * line exists at all: `log.ts` defaults the threshold to `info`, so `debug`
 * here means "never emitted in production" rather than "cheap".
 */
describe('withRequestLog completion level', () => {
  let infoLine: ReturnType<typeof vi.spyOn>
  let warnLine: ReturnType<typeof vi.spyOn>
  let errLine: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    infoLine = vi.spyOn(console, 'log').mockImplementation(() => {})
    warnLine = vi.spyOn(console, 'warn').mockImplementation(() => {})
    errLine = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  function lineFrom(spy: ReturnType<typeof vi.spyOn>): Record<string, unknown> | undefined {
    for (const call of spy.mock.calls) {
      const parsed = JSON.parse(String(call[0])) as Record<string, unknown>
      if (parsed.event === 'request.completed') return parsed
    }
    return undefined
  }

  it('writes a 2xx at info on an ordinary route, so p95 has a source', async () => {
    const handler = withRequestLog('/api/supplier/statement', async () => new Response(null))
    await handler(request())

    const line = lineFrom(infoLine)
    expect(line?.level).toBe('info')
    expect(line?.route).toBe('/api/supplier/statement')
    expect(typeof line?.duration_ms).toBe('number')
  })

  it('keeps a 2xx at debug on the three high-volume routes', async () => {
    for (const route of HIGH_VOLUME_ROUTES) {
      infoLine.mockClear()
      const handler = withRequestLog(route, async () => new Response(null))
      await handler(request())
      expect(lineFrom(infoLine), `${route} should stay debug`).toBeUndefined()
    }
  })

  it('still warns on 4xx and errors on 5xx, high volume or not', async () => {
    const quiet = withRequestLog('/api/a', async () => new Response(null, { status: 429 }))
    await quiet(request())
    expect(lineFrom(warnLine)?.level).toBe('warn')

    const loud = withRequestLog('/api/cart', async () => new Response(null, { status: 500 }))
    await loud(request())
    expect(lineFrom(errLine)?.level).toBe('error')
  })
})

describe('controlFlowStatus', () => {
  it('reads the status out of a redirect digest and defaults to 307', () => {
    expect(controlFlowStatus({ digest: 'NEXT_REDIRECT;replace;/login;307;' })).toBe(307)
    expect(controlFlowStatus({ digest: 'NEXT_REDIRECT;push;/x;308;' })).toBe(308)
    expect(controlFlowStatus({ digest: 'NEXT_REDIRECT;push;/x;;' })).toBe(307)
  })

  it('reads the status out of an http-error digest and defaults to 404', () => {
    expect(controlFlowStatus({ digest: 'NEXT_HTTP_ERROR_FALLBACK;404' })).toBe(404)
    expect(controlFlowStatus({ digest: 'NEXT_HTTP_ERROR_FALLBACK;403' })).toBe(403)
    expect(controlFlowStatus({ digest: 'NEXT_HTTP_ERROR_FALLBACK;' })).toBe(404)
  })

  it('answers null for anything that is a real failure', () => {
    expect(controlFlowStatus(new Error('finalize exploded'))).toBeNull()
    expect(controlFlowStatus({ digest: 12345 })).toBeNull()
    expect(controlFlowStatus(null)).toBeNull()
    expect(controlFlowStatus('NEXT_REDIRECT')).toBeNull()
  })
})
