import { afterEach, describe, expect, it, vi } from 'vitest'
import robots from './robots'

/**
 * The disallow list here is a security assertion, not an SEO one.
 *
 * /redeem/<token> IS a signed voucher token. A crawler that follows one is
 * fetching a coupon somebody paid for, and an indexed one is that coupon in a
 * search result. robots.txt is only a request - the page also sets noindex and
 * requires a supplier session - but it is the outermost layer and it should not
 * be possible to drop it without a test failing.
 */

// stubEnv rather than assigning process.env directly: restoring an absent var
// by assignment writes the string "undefined", which is not nullish and so
// survives the `?? default` in the module under test.
afterEach(() => {
  vi.unstubAllEnvs()
})

function disallowList(): string[] {
  const rules = robots().rules
  const first = Array.isArray(rules) ? rules[0] : rules
  const disallow = first?.disallow
  return Array.isArray(disallow) ? disallow : disallow ? [disallow] : []
}

describe('robots', () => {
  it('disallows the voucher redemption path', () => {
    expect(disallowList()).toContain('/redeem/')
  })

  it('disallows every authenticated area', () => {
    const disallow = disallowList()
    for (const path of ['/account/', '/supplier/', '/admin/', '/checkout', '/cart']) {
      expect(disallow).toContain(path)
    }
  })

  it('still allows the storefront to be crawled', () => {
    const rules = robots().rules
    const first = Array.isArray(rules) ? rules[0] : rules
    expect(first?.allow).toBe('/')
  })

  it('points at the sitemap on the configured origin', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://example.test')
    expect(robots().sitemap).toBe('https://example.test/sitemap.xml')
  })

  it('does not produce a double slash when the origin carries a trailing one', () => {
    // A trailing slash in the env var is the ordinary way this gets configured
    // wrong, and it yields https://host//sitemap.xml, which crawlers treat as a
    // different URL from the one the sitemap declares its entries under.
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://example.test/')
    expect(robots().sitemap).toBe('https://example.test/sitemap.xml')
    expect(robots().host).toBe('https://example.test')
  })
})
