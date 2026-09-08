import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  canonicalFrom,
  hostDeclarations,
  isSelfServing,
  originOf,
  robotsHosts,
} from './audit-canonical-host.mjs'

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

describe('a page it did not receive is not a page without a canonical', () => {
  /**
   * Measured 2026-09-08. After enough probing from one client, the custom
   * domain began answering 403 with Vercel's Security Checkpoint - a 32 KB
   * interstitial with no rel=canonical in it. The script caught only network
   * errors, so it parsed the challenge, found nothing, and reported "the page
   * declares no canonical host at all".
   *
   * That is a conclusion about the SITE, printed by a run that never saw the
   * site. The same shape this script exists to catch elsewhere.
   *
   * (The alias answered 200 at the same moment, so the protection is on the
   * custom domain and the cron scheduler, which uses the alias, was unaffected.
   * The challenge expired within the hour.)
   */
  const source = readFileSync('scripts/audit-canonical-host.mjs', 'utf8')

  it('checks the status before parsing the body', () => {
    const body = source.slice(source.indexOf('let html'))
    expect(body.indexOf('page.ok')).toBeLessThan(body.indexOf('page.text()'))
  })

  it('exits 2 on a non-2xx rather than reporting a finding', () => {
    const guard = source.slice(
      source.indexOf('if (!page.ok)'),
      source.indexOf('html = await page.text()'),
    )
    expect(guard).toContain('not a page')
    expect(guard).toContain('process.exit(2)')
  })

  it('scopes the no-canonical message to a page that actually answered', () => {
    expect(source).toContain('the page answered 2xx and declares no canonical host')
    expect(source).not.toContain('the page declares no canonical host at all')
  })

  it('does not treat a failed robots.txt as an empty robots.txt silently', () => {
    // robots is allowed to be empty, but only after a status check - otherwise
    // a 403 would read as "this site declares no Host and no Sitemap".
    expect(source).toContain('robotsRes.ok')
  })
})

describe('every tag that names a host is found, not just the three I listed', () => {
  /**
   * The first version checked rel=canonical, robots Host and robots Sitemap
   * while the write-up called the finding "every canonical the site declares".
   * Measured 2026-09-08 against the built home page there are five, and `og:url`
   * was named in the document and never in the code.
   *
   * So this discovers them from the head instead of listing them, because a
   * list would fail the same way the next time a tag is added.
   */
  const HEAD = `<html><head>
    <link rel="canonical" href="https://apex.test"/>
    <link rel="alternate" hrefLang="he-IL" href="https://apex.test"/>
    <meta property="og:url" content="https://apex.test"/>
    <meta property="og:image" content="https://apex.test/og.png"/>
    <meta name="twitter:image" content="https://apex.test/og.png"/>
    <meta name="twitter:card" content="summary_large_image"/>
    <link rel="stylesheet" href="/a.css"/>
  </head><body><a href="https://elsewhere.test">x</a></body></html>`

  it('finds all five host-bearing declarations', () => {
    expect(hostDeclarations(HEAD)).toHaveLength(5)
  })

  it('finds hreflang despite React serialising it as hrefLang', () => {
    // A case-sensitive grep for `hreflang=` returns nothing here, which is
    // exactly the wrong answer this file exists to avoid.
    const labels = hostDeclarations(HEAD).map((d) => d.label)
    expect(labels).toContain('alternate he-IL')
  })

  it('ignores a tag with no absolute URL', () => {
    // twitter:card is "summary_large_image", not a host.
    expect(hostDeclarations(HEAD).map((d) => d.label)).not.toContain('twitter:card')
  })

  it('ignores relative hrefs, which name no host', () => {
    expect(hostDeclarations(HEAD).map((d) => d.url)).not.toContain('/a.css')
  })

  it('does not wander into the body, where a link is content and not a declaration', () => {
    expect(hostDeclarations(HEAD).map((d) => d.url)).not.toContain('https://elsewhere.test')
  })

  it('covers the image tags, whose redirect costs more than the others', () => {
    // Social scrapers frequently do not follow redirects for images, so a 308
    // on og:image can mean no preview card at all rather than a slower one.
    const labels = hostDeclarations(HEAD).map((d) => d.label)
    expect(labels).toContain('og:image')
    expect(labels).toContain('twitter:image')
  })
})
