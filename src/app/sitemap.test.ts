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
