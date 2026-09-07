import { log } from '@/lib/observability/log'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  type DeprecationNotice,
  daysUntilSunset,
  deprecationHeaders,
  isSunset,
  recordDeprecatedUse,
} from './deprecation'

vi.mock('@/lib/observability/log', () => ({
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

const DEPRECATED_AT = new Date('2026-01-01T00:00:00.000Z')
const SUNSET_AT = new Date('2026-06-01T00:00:00.000Z')

const notice: DeprecationNotice = {
  endpoint: '/api/cart/add',
  deprecatedAt: DEPRECATED_AT,
  sunsetAt: SUNSET_AT,
  successor: '/api/v2/cart/add',
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('deprecationHeaders', () => {
  it('emits the RFC 9745 Deprecation date as @unix-seconds', () => {
    expect(deprecationHeaders(notice).Deprecation).toBe(`@${DEPRECATED_AT.getTime() / 1000}`)
  })

  it('emits Sunset as an IMF-fixdate and Link as successor-version', () => {
    const headers = deprecationHeaders(notice)
    expect(headers.Sunset).toBe('Mon, 01 Jun 2026 00:00:00 GMT')
    expect(headers.Link).toBe('</api/v2/cart/add>; rel="successor-version"')
  })

  it('omits Sunset entirely rather than inventing a deadline', () => {
    const headers = deprecationHeaders({ endpoint: '/x', deprecatedAt: DEPRECATED_AT })
    expect(headers.Sunset).toBeUndefined()
    expect(headers.Link).toBeUndefined()
    expect(Object.keys(headers)).toEqual(['Deprecation'])
  })
})

describe('isSunset and daysUntilSunset', () => {
  it('is false before, true at and after the moment', () => {
    expect(isSunset(notice, new Date('2026-05-31T23:59:59.000Z'))).toBe(false)
    expect(isSunset(notice, SUNSET_AT)).toBe(true)
    expect(isSunset(notice, new Date('2026-07-01T00:00:00.000Z'))).toBe(true)
  })

  it('is false when no sunset was set', () => {
    expect(isSunset({ endpoint: '/x', deprecatedAt: DEPRECATED_AT })).toBe(false)
    expect(daysUntilSunset({ endpoint: '/x', deprecatedAt: DEPRECATED_AT })).toBeNull()
  })

  it('counts down, then negative', () => {
    expect(daysUntilSunset(notice, new Date('2026-05-30T00:00:00.000Z'))).toBe(2)
    expect(daysUntilSunset(notice, new Date('2026-06-03T00:00:00.000Z'))).toBe(-2)
  })
})

describe('recordDeprecatedUse', () => {
  it('warns before sunset with the full context', () => {
    recordDeprecatedUse(
      notice,
      { requestedVersion: 'v1', client: 'till' },
      new Date('2026-05-30T00:00:00.000Z'),
    )
    expect(log.warn).toHaveBeenCalledTimes(1)
    expect(log.error).not.toHaveBeenCalled()
    const call = vi.mocked(log.warn).mock.calls[0]
    expect(call?.[0]).toBe('api.deprecated_endpoint_used')
    expect(call?.[1]).toMatchObject({
      endpoint: '/api/cart/add',
      successor: '/api/v2/cart/add',
      days_until_sunset: 2,
      requested_version: 'v1',
      client: 'till',
    })
  })

  it('escalates to error once the announced date has passed', () => {
    recordDeprecatedUse(notice, {}, new Date('2026-06-02T00:00:00.000Z'))
    expect(log.error).toHaveBeenCalledTimes(1)
    expect(log.warn).not.toHaveBeenCalled()
    expect(vi.mocked(log.error).mock.calls[0]?.[0]).toBe('api.deprecated_endpoint_past_sunset')
  })

  it('nulls the optional context rather than omitting the keys', () => {
    recordDeprecatedUse({ endpoint: '/x', deprecatedAt: DEPRECATED_AT }, {}, DEPRECATED_AT)
    expect(vi.mocked(log.warn).mock.calls[0]?.[1]).toMatchObject({
      sunset_at: null,
      successor: null,
      days_until_sunset: null,
      requested_version: null,
      client: null,
    })
  })
})
