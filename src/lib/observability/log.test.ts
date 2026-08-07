import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { log } from './log'
import './request-store'
import { runWithRequestContext } from './request-context'

type Line = Record<string, unknown>

function captured(spy: ReturnType<typeof vi.spyOn>): Line {
  expect(spy).toHaveBeenCalledTimes(1)
  const [first] = spy.mock.calls[0] as [string]
  return JSON.parse(first) as Line
}

describe('log', () => {
  let error: ReturnType<typeof vi.spyOn>
  let warn: ReturnType<typeof vi.spyOn>
  let info: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    error = vi.spyOn(console, 'error').mockImplementation(() => {})
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    info = vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('writes one line of parseable JSON, not a formatted message', () => {
    log.error('search.dlq_insert_failed', { reason: 'duplicate key' })

    const line = captured(error)
    expect(line.event).toBe('search.dlq_insert_failed')
    expect(line.level).toBe('error')
    expect(line.reason).toBe('duplicate key')
    expect(typeof line.ts).toBe('string')
  })

  it('carries the request id, which is the whole point', () => {
    runWithRequestContext({ requestId: 'req-abc', route: '/api/cart', method: 'GET' }, () => {
      log.error('cart.reap_failed', {})
    })

    const line = captured(error)
    expect(line.request_id).toBe('req-abc')
    expect(line.route).toBe('/api/cart')
    expect(line.method).toBe('GET')
  })

  it('says null rather than inventing an id outside a request', () => {
    log.error('audit.write_failed', {})
    expect(captured(error).request_id).toBeNull()
  })

  it('chooses the console method by level, because that is what a drain reads', () => {
    log.error('a', {})
    log.warn('b', {})
    log.info('c', {})

    expect(error).toHaveBeenCalledTimes(1)
    expect(warn).toHaveBeenCalledTimes(1)
    expect(info).toHaveBeenCalledTimes(1)
  })

  it('drops debug under the default threshold', () => {
    log.debug('request.completed', { status: 200 })
    expect(info).not.toHaveBeenCalled()
  })

  it('serialises an Error instead of logging it as {}', () => {
    // An Error has no enumerable own properties: handing one straight to the
    // scrubber turns the failure into the absence of a failure.
    const boom = new Error('resend refused')
    boom.stack = 'Error: resend refused\n    at send'

    log.error('email.send_failed', { err: boom })

    const err = captured(error).err as Record<string, unknown>
    expect(err.name).toBe('Error')
    expect(err.message).toBe('resend refused')
    expect(err.stack).toContain('at send')
  })

  it('keeps the digest, the only handle on a Server Component error', () => {
    const boom = Object.assign(new Error('render failed'), { digest: '287412' })
    log.error('render.failed', { err: boom })

    expect((captured(error).err as Record<string, unknown>).digest).toBe('287412')
  })

  it('redacts through the same scrubber Sentry uses', () => {
    log.error('payments.verify_failed', {
      order_id: 'ord_1',
      cardcom_token: '4580-0000-0000-0000',
      detail: { webhook_secret: 'hunter2' },
    })

    const line = captured(error)
    expect(line.order_id).toBe('ord_1')
    expect(line.cardcom_token).toBe('[redacted]')
    expect((line.detail as Record<string, unknown>).webhook_secret).toBe('[redacted]')
  })

  it('omits undefined fields rather than emitting nulls for them', () => {
    log.error('analytics.sales_lines_failed', { reason: undefined })
    expect('reason' in captured(error)).toBe(false)
  })

  it('never throws, because every call site is already on a failure branch', () => {
    const circular: Record<string, unknown> = { name: 'cycle' }
    circular.self = circular

    expect(() => log.error('audit.write_threw', { circular })).not.toThrow()
  })
})

describe('log level threshold', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('is read from LOG_LEVEL at module load', async () => {
    vi.stubEnv('LOG_LEVEL', 'debug')
    vi.resetModules()
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})

    const { log: reloaded } = await import('./log')
    reloaded.debug('request.completed', { status: 200 })

    expect(spy).toHaveBeenCalledTimes(1)
    spy.mockRestore()
  })

  it('silences everything below error when asked to', async () => {
    vi.stubEnv('LOG_LEVEL', 'error')
    vi.resetModules()
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const { log: reloaded } = await import('./log')
    reloaded.warn('email.disabled', {})

    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })
})
