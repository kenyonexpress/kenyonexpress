import { describe, expect, it } from 'vitest'
import { isTracedPath, makeTracesSampler, resolveSampleRate, tracingEnabled } from './tracing'

describe('resolveSampleRate', () => {
  it('is off when unset or blank', () => {
    expect(resolveSampleRate(undefined)).toBe(0)
    expect(resolveSampleRate('')).toBe(0)
    expect(resolveSampleRate('   ')).toBe(0)
  })

  it('reads a fraction', () => {
    expect(resolveSampleRate('0.1')).toBeCloseTo(0.1)
    expect(resolveSampleRate('1')).toBe(1)
  })

  it('turns garbage into off rather than NaN', () => {
    // The whole point: `tracesSampleRate: NaN` looks configured and samples
    // nothing, because every comparison against NaN is false.
    expect(resolveSampleRate('yes')).toBe(0)
    expect(Number.isNaN(resolveSampleRate('yes'))).toBe(false)
  })

  it('clamps rather than trusting the operator', () => {
    expect(resolveSampleRate('-1')).toBe(0)
    expect(resolveSampleRate('7')).toBe(1)
  })
})

describe('tracingEnabled', () => {
  it('agrees with the rate', () => {
    expect(tracingEnabled(undefined)).toBe(false)
    expect(tracingEnabled('0')).toBe(false)
    expect(tracingEnabled('0.05')).toBe(true)
  })
})

describe('isTracedPath', () => {
  it('keeps the paths a customer waits on', () => {
    expect(isTracedPath('/checkout')).toBe(true)
    expect(isTracedPath('/api/payments/cardcom/webhook')).toBe(true)
    expect(isTracedPath('/product/some-slug')).toBe(true)
  })

  it('drops the polled and the scheduled', () => {
    expect(isTracedPath('/api/health')).toBe(false)
    expect(isTracedPath('/api/cron/invoices')).toBe(false)
    expect(isTracedPath('/monitoring')).toBe(false)
    expect(isTracedPath('/_next/static/chunk.js')).toBe(false)
  })
})

describe('makeTracesSampler', () => {
  const sampler = makeTracesSampler(0.25)

  it('reads the path off a server span name', () => {
    expect(sampler({ name: 'GET /api/health' })).toBe(0)
    expect(sampler({ name: 'POST /checkout' })).toBe(0.25)
  })

  it('prefers the route attribute when there is one', () => {
    expect(
      sampler({ name: 'GET /whatever', attributes: { 'http.route': '/api/cron/stock' } }),
    ).toBe(0)
  })

  it('never breaks a trace an upstream already decided', () => {
    // Even for a path this sampler would otherwise drop: half a trace is worse
    // than none, because nothing joins the two halves.
    expect(sampler({ name: 'GET /api/health', parentSampled: true })).toBe(1)
    expect(sampler({ name: 'POST /checkout', parentSampled: false })).toBe(0)
  })

  it('falls back to the rate when there is no path to judge', () => {
    expect(sampler({})).toBe(0.25)
    expect(sampler({ name: 'some.background.task' })).toBe(0.25)
  })

  it('samples nothing when the rate is zero', () => {
    expect(makeTracesSampler(0)({ name: 'POST /checkout' })).toBe(0)
  })
})
