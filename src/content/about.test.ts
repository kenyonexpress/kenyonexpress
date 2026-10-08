import { describe, expect, it } from 'vitest'
import {
  ABOUT_UPDATED_AT,
  aboutMission,
  aboutSections,
  aboutStory,
  aboutTeam,
  pressMentions,
} from './about'

/**
 * The about content stays inside what the repo can show (STEP 53).
 *
 * The module's own comment says why: every sentence on an about page is a
 * claim the business can be held to. These tests pin the three places an
 * invented claim is most likely to arrive: a press mention without a source,
 * a count or a founding year in the copy, and a team member with no role.
 */

const UNMEASURED_CLAIMS = [
  /אלפי/,
  /מאות/,
  /מיליון/,
  /\b(19|20)\d\d\b/, // a founding year; none is recorded
  /מאז \d/,
  /נוסד/,
  /הוקם ב/,
]

function everyParagraph(): string[] {
  return [aboutMission, aboutStory, ...aboutSections].flatMap((s) => s.paragraphs)
}

describe('content/about', () => {
  it('has a mission and a story with real paragraphs', () => {
    expect(aboutMission.paragraphs.length).toBeGreaterThan(0)
    expect(aboutStory.paragraphs.length).toBeGreaterThan(0)
    for (const p of everyParagraph()) expect(p.trim().length).toBeGreaterThan(20)
  })

  it('makes no count or founding-date claim the repo cannot measure', () => {
    for (const p of everyParagraph()) {
      for (const pattern of UNMEASURED_CLAIMS) {
        expect(p, `"${p}" matches ${pattern}`).not.toMatch(pattern)
      }
    }
  })

  it('names Ofir, with a role, and nobody without one', () => {
    expect(aboutTeam.map((m) => m.name)).toContain('אופיר')
    for (const member of aboutTeam) {
      expect(member.role.trim().length).toBeGreaterThan(0)
      expect(member.about.trim().length).toBeGreaterThan(0)
    }
  })

  it('refuses a press mention without an https source, an outlet and an ISO date', () => {
    for (const mention of pressMentions) {
      expect(mention.url).toMatch(/^https:\/\/[^\s]+$/)
      expect(mention.outlet.trim().length).toBeGreaterThan(0)
      expect(mention.title.trim().length).toBeGreaterThan(0)
      expect(mention.publishedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(Number.isNaN(new Date(mention.publishedAt).getTime())).toBe(false)
    }
    // The registry is a list of real articles, not a marketing block; every
    // URL is distinct.
    expect(new Set(pressMentions.map((m) => m.url)).size).toBe(pressMentions.length)
  })

  it('carries an ISO updated-at date', () => {
    expect(ABOUT_UPDATED_AT).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})
