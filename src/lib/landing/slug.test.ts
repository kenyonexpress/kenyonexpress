import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { LANDING_SLUG_MAX_LENGTH, isLandingSlug, landingPath, landingSlugFromPath } from './slug'

describe('landing slugs', () => {
  it('accepts lower-case words joined by single dashes', () => {
    for (const slug of ['welcome', 'summer-2026', 'a1', 'x-y-z']) {
      expect(isLandingSlug(slug), slug).toBe(true)
    }
  })

  it('refuses anything the route or the CHECK would refuse', () => {
    for (const slug of [
      '',
      'Welcome',
      '-lead',
      'trail-',
      'double--dash',
      'with space',
      'עברית',
      'a/b',
      'a'.repeat(LANDING_SLUG_MAX_LENGTH + 1),
      42,
      null,
    ]) {
      expect(isLandingSlug(slug), String(slug)).toBe(false)
    }
  })

  it('reads the slug off a landing pathname and nothing else', () => {
    expect(landingSlugFromPath('/lp/welcome')).toBe('welcome')
    expect(landingSlugFromPath('/lp/welcome/')).toBeNull()
    expect(landingSlugFromPath('/lp/')).toBeNull()
    expect(landingSlugFromPath('/lp')).toBeNull()
    expect(landingSlugFromPath('/products')).toBeNull()
    expect(landingSlugFromPath('/lpx/welcome')).toBeNull()
    expect(landingPath('welcome')).toBe('/lp/welcome')
  })

  it('matches the CHECK constraint migration 262 carries', () => {
    // The route and the database must agree on what a slug is: a row the
    // route 404s cannot be saved, and a saved row always routes.
    const sql = readFileSync(
      resolve(process.cwd(), 'migrations/pending/262_landing_pages.sql'),
      'utf8',
    )
    expect(sql).toContain("slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'")
    expect(sql).toContain(`length(slug) <= ${LANDING_SLUG_MAX_LENGTH}`)
  })
})
