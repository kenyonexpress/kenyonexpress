import { describe, expect, it } from 'vitest'
import { AUTHORED_CATEGORY_GUIDES, authoredGuideFor } from './authored'
import { countGuideWords, parseGuideMarkdown } from './markdown'

/**
 * The authored guides (STEP 65) stay inside what the repo can show and at
 * the length the step asks for. The slugs are the twelve active categories
 * read from production on 2026-10-09; a category that loses its guide here
 * loses it on the storefront until an editor writes a row.
 */

const LIVE_SLUGS = [
  'hot-deals',
  'under-99',
  'new',
  'restaurants-cafes',
  'beauty-health',
  'phones-computers',
  'baby-kids',
  'vacation',
  'pets',
  'electronics',
  'professionals',
  'courses',
]

/** The patterns content/about.test.ts refuses, plus the ones a buyer guide invites. */
const UNMEASURED_CLAIMS = [
  /אלפי/,
  /מאות/,
  /מיליון/,
  /\b(19|20)\d\d\b/,
  /מאז \d/,
  /נוסד/,
  /הוקם ב/,
  /הזול ביותר/,
  /הכי זול/,
  /\d+\s*%/, // a discount figure
  /₪/, // a price
]

describe('authored category guides', () => {
  it('covers every live category exactly once', () => {
    const slugs = AUTHORED_CATEGORY_GUIDES.map((g) => g.slug)
    expect([...slugs].sort()).toEqual([...LIVE_SLUGS].sort())
    expect(new Set(slugs).size).toBe(slugs.length)
  })

  it.each(AUTHORED_CATEGORY_GUIDES.map((g) => [g.slug, g] as const))(
    '%s is a ~300-word guide with headings, a list and paragraphs',
    (_slug, guide) => {
      const words = countGuideWords(guide.body_md)
      expect(words).toBeGreaterThanOrEqual(260)
      expect(words).toBeLessThanOrEqual(400)
      const kinds = new Set(parseGuideMarkdown(guide.body_md).map((b) => b.kind))
      expect(kinds).toEqual(new Set(['heading', 'paragraph', 'list']))
      // The default H2 is "מדריך קנייה: <name>"; a title set here must not be blank.
      if (guide.title_he !== null) expect(guide.title_he.trim().length).toBeGreaterThan(2)
      // Opens with a paragraph, so the meta description fallback has text.
      expect(parseGuideMarkdown(guide.body_md)[0]?.kind).toBe('paragraph')
    },
  )

  it('makes no unmeasured claim', () => {
    for (const guide of AUTHORED_CATEGORY_GUIDES) {
      for (const pattern of UNMEASURED_CLAIMS) {
        expect(guide.body_md, `${guide.slug} matches ${pattern}`).not.toMatch(pattern)
        if (guide.title_he) expect(guide.title_he).not.toMatch(pattern)
      }
      expect(guide.body_md).not.toMatch(/<[a-z]+>/i)
    }
  })

  it('looks a guide up by slug', () => {
    expect(authoredGuideFor('vacation')?.title_he).toContain('צימרים')
    expect(authoredGuideFor('e2e-test-category')).toBeNull()
  })
})
