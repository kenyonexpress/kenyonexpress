import { describe, expect, it } from 'vitest'
import {
  API_VERSIONS,
  CURRENT_API_VERSION,
  apiVersionHeaders,
  compareApiVersions,
  isSupportedApiVersion,
  parseApiVersion,
  resolveApiVersion,
  versionFromPath,
} from './api-versioning'

describe('parseApiVersion', () => {
  it('normalises the accepted spellings to one form', () => {
    expect(parseApiVersion('v1')).toBe('v1')
    expect(parseApiVersion('1')).toBe('v1')
    expect(parseApiVersion(' V2 ')).toBe('v2')
    expect(parseApiVersion('v10')).toBe('v10')
  })

  it('rejects anything that would give a version two spellings', () => {
    expect(parseApiVersion('v01')).toBeNull()
    expect(parseApiVersion('v1.2')).toBeNull()
    expect(parseApiVersion('v0')).toBeNull()
    expect(parseApiVersion('latest')).toBeNull()
    expect(parseApiVersion('')).toBeNull()
    expect(parseApiVersion(null)).toBeNull()
    expect(parseApiVersion(undefined)).toBeNull()
  })
})

describe('versionFromPath', () => {
  it('reads the segment after /api/', () => {
    expect(versionFromPath('/api/v1/cart')).toBe('v1')
    expect(versionFromPath('/api/v2')).toBe('v2')
    expect(versionFromPath('https://x.test/api/v3/a/b')).toBe('v3')
  })

  it('does not mistake a slug for a version', () => {
    expect(versionFromPath('/category/v2-cables')).toBeNull()
    expect(versionFromPath('/api/cart')).toBeNull()
    expect(versionFromPath('/v1/cart')).toBeNull()
    expect(versionFromPath(null)).toBeNull()
  })
})

describe('resolveApiVersion', () => {
  it('prefers the path over the header', () => {
    const headers = new Headers({ 'x-api-version': 'v9' })
    expect(resolveApiVersion({ pathname: '/api/v1/cart', headers })).toEqual({
      version: 'v1',
      source: 'path',
      supported: true,
    })
  })

  it('falls back to the header, from a Headers or a plain record', () => {
    expect(resolveApiVersion({ headers: new Headers({ 'x-api-version': '1' }) })).toEqual({
      version: 'v1',
      source: 'header',
      supported: true,
    })
    expect(resolveApiVersion({ headers: { 'X-API-Version': 'v1' } })).toEqual({
      version: 'v1',
      source: 'header',
      supported: true,
    })
  })

  it('defaults only when the caller said nothing', () => {
    expect(resolveApiVersion({})).toEqual({
      version: CURRENT_API_VERSION,
      source: 'default',
      supported: true,
    })
    expect(resolveApiVersion({ pathname: '/api/cart', headers: new Headers() })).toEqual({
      version: CURRENT_API_VERSION,
      source: 'default',
      supported: true,
    })
  })

  it('reports an unknown version as unsupported instead of downgrading it', () => {
    const resolved = resolveApiVersion({ pathname: '/api/v99/cart' })
    expect(resolved.version).toBe('v99')
    expect(resolved.supported).toBe(false)
    expect(resolved.source).toBe('path')
  })

  it('reports an unparseable header as a caller error, not as silence', () => {
    const resolved = resolveApiVersion({ headers: { 'x-api-version': 'latest' } })
    expect(resolved.source).toBe('header')
    expect(resolved.supported).toBe(false)
    expect(resolved.version).toBe('latest')
  })
})

describe('compareApiVersions', () => {
  it('orders numerically, which string comparison gets wrong', () => {
    expect(compareApiVersions('v9', 'v10')).toBe(-1)
    expect(compareApiVersions('v10', 'v9')).toBe(1)
    expect(compareApiVersions('v2', 'v2')).toBe(0)
    // The bug this function exists to prevent.
    expect('v10' < 'v9').toBe(true)
  })

  it('throws on a non-version', () => {
    expect(() => compareApiVersions('latest', 'v1')).toThrow(TypeError)
  })
})

describe('supported set', () => {
  it('keeps CURRENT_API_VERSION inside API_VERSIONS', () => {
    expect(API_VERSIONS).toContain(CURRENT_API_VERSION)
    expect(isSupportedApiVersion(CURRENT_API_VERSION)).toBe(true)
    expect(isSupportedApiVersion('v99')).toBe(false)
  })

  it('announces what it served and what it serves', () => {
    expect(apiVersionHeaders()).toEqual({
      'X-API-Version': CURRENT_API_VERSION,
      'X-API-Supported-Versions': API_VERSIONS.join(', '),
    })
  })
})
