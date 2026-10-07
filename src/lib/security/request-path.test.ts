import { describe, expect, it } from 'vitest'
import { REQUEST_PATH_HEADER, returnPathFromReferer, safeReturnPath } from './request-path'

describe('safeReturnPath', () => {
  it('keeps a rooted path with its query', () => {
    expect(safeReturnPath('/product/abc?ref=X1')).toBe('/product/abc?ref=X1')
    expect(safeReturnPath('/')).toBe('/')
  })

  it.each<[string | null, string]>([
    [null, 'absent'],
    ['', 'empty'],
    ['product/abc', 'not rooted'],
    ['//evil.example/x', 'scheme-relative'],
    ['/\\evil.example', 'backslash scheme-relative, as some browsers read it'],
    ['https://evil.example/', 'absolute'],
    ['/ok\r\nLocation: x', 'header injection'],
  ])('falls back to the home page for %s (%s)', (value) => {
    expect(safeReturnPath(value)).toBe('/')
  })
})

describe('returnPathFromReferer', () => {
  it('takes the path and query off a full URL', () => {
    expect(returnPathFromReferer('https://kenyonexpress.co.il/cart?x=1')).toBe('/cart?x=1')
  })

  it('is the home page for a trimmed or missing Referer', () => {
    // What `Referrer-Policy: strict-origin` sends: origin only.
    expect(returnPathFromReferer('https://kenyonexpress.co.il/')).toBe('/')
    expect(returnPathFromReferer(null)).toBe('/')
    expect(returnPathFromReferer('not a url')).toBe('/')
  })

  it('refuses the scheme-relative path a crafted Referer can carry', () => {
    expect(returnPathFromReferer('https://kenyonexpress.co.il//evil.example')).toBe('/')
  })
})

describe('REQUEST_PATH_HEADER', () => {
  it('is lower-case, as Headers normalises it', () => {
    expect(REQUEST_PATH_HEADER).toBe(REQUEST_PATH_HEADER.toLowerCase())
  })
})
