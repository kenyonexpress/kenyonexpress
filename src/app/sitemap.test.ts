import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The contract the sitemap's READS have to keep, asserted on their source.
 *
 * These properties are about how the data is fetched and cached, not about what
 * comes out, so they cannot be checked by calling anything: `sitemap-data` is
 * `use cache` all the way down and importing it in a test drags `next/cache`
 * into a plain vitest run. The SHAPE of the output is covered properly, by
 * calling the functions, in `lib/seo/sitemap-sections.test.ts`, which is the
 * whole reason the pure half was split out of the old `app/sitemap.ts`.
 */

const DATA = readFileSync(resolve(__dirname, '..', 'lib', 'seo', 'sitemap-data.ts'), 'utf8')
const INDEX = readFileSync(resolve(__dirname, 'sitemap.xml', 'route.ts'), 'utf8')

describe('sitemap catalogue client', () => {
  it('reads with the anon client, not the service-role admin client', () => {
    // Locally the demo secret key makes the admin client fail silently, and the
    // sitemap collapsed to the three static URLs.
    expect(DATA).toContain('createPublicClient')
    expect(DATA).not.toContain('createAdminClient')
  })

  it('invalidates with the catalogue tag', () => {
    expect(DATA).toContain('cacheTag(CATALOGUE_TAG)')
    expect(DATA).toContain("'use cache'")
    expect(DATA).toContain("cacheLife('hours')")
  })

  it('tags and caches every read, not just the first one', () => {
    // Three reads, and each needs its own pair: `use cache` and `cacheLife` are
    // directives about the scope they are written in. Anchored to the start of
    // a line so the prose above, which names all three directives, is not
    // counted as three more call sites.
    const count = (pattern: RegExp) => (DATA.match(pattern) ?? []).length
    const scopes = count(/^ +'use cache'$/gm)
    expect(scopes).toBeGreaterThanOrEqual(3)
    expect(count(/^ +cacheTag\(CATALOGUE_TAG\)$/gm)).toBe(scopes)
    expect(count(/^ +cacheLife\('hours'\)$/gm)).toBe(scopes)
  })

  it('fails loudly on a bad read instead of caching an empty sitemap', () => {
    // `use cache` stores nothing for a scope that threw, so the last good
    // sitemap keeps being served. A discarded error would store the empty list
    // as the good answer for the full cache life, and a sitemap that lists
    // nothing is a deindexing request.
    expect((DATA.match(/orFail\(/g) ?? []).length).toBe(3)
  })
})

describe('lastmod is derived, not the clock', () => {
  it('does not stamp the static entries with new Date()', () => {
    // Google ignores an inaccurate lastmod for the WHOLE FILE, not per URL, so
    // a handful of dishonest dates cost the accurate ones on every product too.
    expect(DATA).toContain('newestTimestamp')
    expect(DATA).toContain('catalogueTouched')
    expect(DATA).not.toContain('new Date()')
  })
})

describe('/sitemap.xml is the index', () => {
  it('serves a sitemapindex and lists no page URLs of its own', () => {
    expect(INDEX).toContain('sitemapIndexXml')
    expect(INDEX).not.toContain('urlsetXml')
  })

  it('builds the list from SITEMAP_SECTIONS rather than restating it', () => {
    // A hand-kept list here is how `/city/<region>` came to be in no sitemap:
    // the route was built, and the four lists in the old file stayed four.
    expect(INDEX).toContain('SITEMAP_SECTIONS.map')
  })
})
