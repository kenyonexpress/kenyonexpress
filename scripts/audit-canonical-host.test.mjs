import { describe, expect, it } from 'vitest'
import { canonicalFrom, isSelfServing, originOf, robotsHosts } from './audit-canonical-host.mjs'

/**
 * Measured 2026-09-08: the app declares the apex everywhere - rel=canonical,
 * robots Host, robots Sitemap, og:url, every sitemap <loc> - and the apex
 * answers 308 to www. So the effective canonical is the host the code does not
 * name, and no test in this repository could see it: site-url.ts falls back to
 * the apex, that fallback is well formed, and every SEO test passes. The defect
 * lives in the relationship between the build and the domain configuration, and
 * only one of those is in here.
 */
describe('canonicalFrom', () => {
  it('reads the href regardless of attribute order', () => {
    expect(canonicalFrom('<link href="https://a.test/" rel="canonical"/>')).toBe('https://a.test/')
    expect(canonicalFrom("<link rel='canonical' href='https://b.test'>")).toBe('https://b.test')
  })

  it('returns null rather than a guess when there is no canonical', () => {
    expect(canonicalFrom('<html><head><title>x</title></head></html>')).toBeNull()
  })

  it('does not match a stylesheet link', () => {
    expect(canonicalFrom('<link rel="stylesheet" href="/a.css">')).toBeNull()
  })
})

describe('robotsHosts', () => {
  it('reads Host and Sitemap case-insensitively', () => {
    const robots =
      'User-Agent: *\nAllow: /\n\nhost: https://a.test\nSITEMAP: https://a.test/sitemap.xml\n'
    expect(robotsHosts(robots)).toEqual({
      host: 'https://a.test',
      sitemap: 'https://a.test/sitemap.xml',
    })
  })

  it('returns nulls for a robots file that declares neither', () => {
    expect(robotsHosts('User-Agent: *\nDisallow:\n')).toEqual({ host: null, sitemap: null })
  })
})

describe('isSelfServing', () => {
  it('accepts a 2xx', () => {
    expect(isSelfServing(200, null, 'https://a.test')).toBe(true)
  })

  it('rejects a redirect to a different origin, which is the whole finding', () => {
    expect(isSelfServing(308, 'https://www.a.test/', 'https://a.test')).toBe(false)
  })

  it('accepts a redirect that stays on the declared origin', () => {
    // Trailing-slash and path normalisation are not a canonical-host problem.
    expect(isSelfServing(308, 'https://a.test/home', 'https://a.test')).toBe(true)
  })

  it('rejects a redirect with no destination rather than assuming', () => {
    expect(isSelfServing(301, null, 'https://a.test')).toBe(false)
  })
})

describe('originOf', () => {
  it('drops the path so a sitemap URL compares as a host', () => {
    expect(originOf('https://a.test/sitemap.xml')).toBe('https://a.test')
  })

  it('returns null for something that is not a URL', () => {
    expect(originOf('not a url')).toBeNull()
  })
})
