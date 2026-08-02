import { describe, expect, it } from 'vitest'
import { safeNextPath } from './safe-next'

describe('safeNextPath', () => {
  it('keeps ordinary same-site paths', () => {
    expect(safeNextPath('/')).toBe('/')
    expect(safeNextPath('/checkout')).toBe('/checkout')
    expect(safeNextPath('/product/abc?size=1#top')).toBe('/product/abc?size=1#top')
  })

  // The vulnerability: startsWith('/') alone accepted protocol-relative URLs,
  // so an attacker could send users off-site after login.
  it('rejects protocol-relative URLs that pass a leading-slash check', () => {
    expect(safeNextPath('//evil.com')).toBe('/')
    expect(safeNextPath('//evil.com/path')).toBe('/')
  })

  it('rejects backslash forms that browsers normalize to //', () => {
    expect(safeNextPath('/\\evil.com')).toBe('/')
    expect(safeNextPath('/\\/evil.com')).toBe('/')
  })

  it('rejects absolute URLs and scheme-bearing values', () => {
    expect(safeNextPath('https://evil.com')).toBe('/')
    expect(safeNextPath('http://evil.com')).toBe('/')
    expect(safeNextPath('javascript:alert(1)')).toBe('/')
    expect(safeNextPath('evil.com')).toBe('/')
  })

  it('rejects values carrying control characters', () => {
    expect(safeNextPath('/foo\nSet-Cookie: x=1')).toBe('/')
    expect(safeNextPath('/foo\r\n/bar')).toBe('/')
    expect(safeNextPath('/foo\u000bbar')).toBe('/')
  })

  it('falls back to root for empty and non-string input', () => {
    expect(safeNextPath('')).toBe('/')
    expect(safeNextPath(null)).toBe('/')
    expect(safeNextPath(undefined)).toBe('/')
    expect(safeNextPath(42)).toBe('/')
    expect(safeNextPath(['/a'])).toBe('/')
  })
})
