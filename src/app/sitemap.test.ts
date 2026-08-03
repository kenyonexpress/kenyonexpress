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
