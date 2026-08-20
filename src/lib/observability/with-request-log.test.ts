import { captureRouteFailure } from '@/lib/monitoring/capture'
import type { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { log } from './log'
import { getRequestContext } from './request-context'
import { REQUEST_ID_HEADER } from './request-id'
import { withRequestLog } from './with-request-log'

vi.mock('@/lib/monitoring/capture', () => ({
  captureRouteFailure: vi.fn(),
}))

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
    vi.mocked(captureRouteFailure).mockClear()
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

  it('reports a 5xx the handler RETURNED, which nothing else can see', async () => {
    // onRequestError only hears about what escapes a handler. A route that
    // catches its own failure and answers `{ ok: false }, { status: 500 }`
    // never throws, so before this the customer got a 500 and Sentry got
    // nothing. Four routes did exactly that.
    const handler = withRequestLog('/api/cron/invoices', async () =>
      Response.json({ ok: false }, { status: 500 }),
    )

    await handler(request({ id: 'five-hundred' }))

    expect(captureRouteFailure).toHaveBeenCalledTimes(1)
    const [message, context] = vi.mocked(captureRouteFailure).mock.calls[0] as [
      string,
      { route: string; status: number },
    ]
    expect(message).toContain('/api/cron/invoices')
    expect(context.route).toBe('/api/cron/invoices')
    expect(context.status).toBe(500)
  })

  it('does not report a 4xx, because a rejected request is the system working', async () => {
    const handler = withRequestLog('/api/cart', async () => new Response(null, { status: 404 }))
    await handler(request())
    expect(captureRouteFailure).not.toHaveBeenCalled()
  })

  it('does not double-report a throw, which onRequestError already files', async () => {
    const handler = withRequestLog('/api/payments/cardcom/webhook', async () => {
      throw new Error('finalize exploded')
    })

    await expect(handler(request())).rejects.toThrow('finalize exploded')

    // Two events for one error would also mean two pushes to the phone on the
    // money path.
    expect(captureRouteFailure).not.toHaveBeenCalled()
  })

  it('leaves no context behind for whatever runs next', async () => {
    const handler = withRequestLog('/api/health', async () => new Response(null, { status: 200 }))
    await handler(request({ id: 'scoped' }))

    expect(getRequestContext()).toBeUndefined()
    log.error('after.request', {})
    expect(JSON.parse((errorLine.mock.calls[0] as [string])[0]).request_id).toBeNull()
  })
})
