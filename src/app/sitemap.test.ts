import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const src = readFileSync(resolve(__dirname, 'sitemap.ts'), 'utf8')

describe('sitemap catalogue client', () => {
  it('reads with the anon client, not the service-role admin client', () => {
    expect(src).toContain('createPublicClient')
    expect(src).not.toContain('createAdminClient')
  })

  it('invalidates with the catalogue tag', () => {
    expect(src).toContain('cacheTag(CATALOGUE_TAG)')
    expect(src).toContain("'use cache'")
    expect(src).toContain("cacheLife('hours')")
  })
})

describe('lastmod is derived, not the clock', () => {
  it('does not stamp the static entries with new Date()', () => {
    // A lastmod that is always "now" claims all four pages changed on every
    // fetch. Google ignores an inaccurate lastmod for the WHOLE FILE, so four
    // dishonest dates cost the accurate ones on every product too.
    expect(src).toContain('newestTimestamp')
    expect(src).toContain('catalogueTouched')
  })

  it('leaves /contact without one rather than inventing a date', () => {
    // It changes when the code changes and there is no signal here for that.
    // The entry line, not a comment line that happens to mention the path.
    const entry = src.split('\n').find((line) => line.includes('`${base}/contact`')) ?? ''
    expect(entry).not.toBe('')
    expect(entry).not.toContain('lastModified')
  })
})

/**
 * EVERY INDEXABLE LEGAL PAGE IS IN THE SITEMAP.
 *
 * The cookie policy was live, linked from the footer, canonical-tagged and
 * absent from this file, because the sitemap builds its legal entries from
 * `LEGAL_PAGE_SLUGS` (the `src/content/legal` registry) and the cookie policy
 * belongs to the other one (`(legal)/_content`). Two registries is a known and
 * deliberately tolerated state - see `legal-duplication.test.ts` - so the thing
 * that has to be checked is not "unify them" but "neither one leaks a page".
 *
 * Source-scanned rather than executed: calling `sitemap()` needs a Supabase
 * client and the `use cache` runtime, and the failure being guarded here is a
 * missing LINE, which is visible in the source.
 */
describe('the sitemap lists every legal page the site serves', () => {
  it('has an entry for each canonical legal path', () => {
    // The four from src/content/legal arrive via LEGAL_PAGE_SLUGS, which is
    // spread from the registry, so those are covered by construction. The
    // cookie policy is the one that has to be named.
    expect(src).toContain('LEGAL_PAGE_SLUGS.map')
    expect(src).toContain('${base}/cookie-policy')
  })

  it('gives the cookie policy a real date rather than the clock', () => {
    const entry = src.split('\n').find((line) => line.includes('`${base}/cookie-policy`')) ?? ''
    expect(entry).not.toBe('')
    // The document carries its own updatedAt; using it is the difference
    // between a lastmod that means something and one Google discards.
    expect(src).toContain("getLegalDoc('cookies').updatedAt")
  })

  it('never lists a path robots.txt disallows', () => {
    // A URL in the sitemap and in the disallow list is a contradiction a
    // crawler resolves by trusting neither. /redeem/ is the one that matters:
    // that path IS a signed voucher token.
    for (const path of ['/redeem/', '/account/', '/admin/', '/checkout', '/cart', '/supplier/']) {
      expect(src).not.toContain(`\${base}${path}`)
    }
  })
})
