import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { LEGAL_DOCS } from './_content'
import type { LegalDoc } from './_content/types'

/**
 * What a test can hold for a legal page, and what it cannot.
 *
 * It cannot check that the law is stated correctly; that is what counsel
 * approval (gate LP3 in docs/ARCHITECTURE-LEGAL-PAGES.md) is for. What it CAN
 * hold is every failure that turns a correct document into a wrong one without
 * anybody editing a sentence:
 *
 *  - a document that exists as a page but is missing from the link list, so
 *    the policy is unreachable from the site;
 *  - a duplicated anchor id, which sends a support link to the wrong clause;
 *  - a table row shorter than its header, which in the cancellation-window
 *    table renders a rule under the wrong column;
 *  - the four product facts the terms may not contradict, and the one word
 *    they may not contain.
 */
const LEGAL_DIR = join(process.cwd(), 'src', 'app', '(legal)', 'legal')

function doc(slug: LegalDoc['slug']): LegalDoc {
  const found = LEGAL_DOCS.find((candidate) => candidate.slug === slug)
  if (!found) throw new Error(`missing document: ${slug}`)
  return found
}

describe('every legal document is reachable', () => {
  it('has one page directory per document, and no orphan directory', () => {
    const directories = readdirSync(LEGAL_DIR, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort()

    expect(directories).toEqual(LEGAL_DOCS.map((d) => d.slug).sort())
  })

  it('lists the four documents the launch checklist names', () => {
    expect(LEGAL_DOCS.map((d) => d.slug)).toEqual(['terms', 'privacy', 'returns', 'accessibility'])
  })
})

describe.each(LEGAL_DOCS.map((d) => [d.slug, d] as const))('%s', (_slug, document) => {
  it('carries the metadata a crawler and a reader need', () => {
    expect(document.title.length).toBeGreaterThan(0)
    expect(document.description.length).toBeGreaterThan(50)
    expect(document.intro.length).toBeGreaterThan(0)
    expect(document.sections.length).toBeGreaterThan(0)
  })

  it('has an update date that is a real ISO day', () => {
    expect(document.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(Number.isNaN(new Date(document.updatedAt).getTime())).toBe(false)
  })

  it('says out loud that counsel has not approved it yet', () => {
    // Removing this notice is a decision somebody makes on purpose, when a
    // lawyer has actually signed off. It should not be able to fall out.
    expect(document.reviewNotice, 'a page that looks final is read as final').toBeTruthy()
  })

  it('keeps anchor ids unique, so a support link lands on one clause', () => {
    const ids = document.sections.map((section) => section.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) {
      expect(id).toMatch(/^[a-z][a-z0-9-]*$/)
    }
  })

  it('keeps every table row as wide as its header', () => {
    for (const section of document.sections) {
      for (const block of section.blocks) {
        if (block.type !== 'table') continue
        for (const row of block.rows) {
          expect(row.length, `${document.slug}/${section.id}: ${row[0]}`).toBe(block.head.length)
        }
      }
    }
  })

  it('has no empty section and no empty list', () => {
    for (const section of document.sections) {
      expect(section.blocks.length, section.id).toBeGreaterThan(0)
      for (const block of section.blocks) {
        if (block.type === 'ordered' || block.type === 'unordered') {
          expect(block.items.length, section.id).toBeGreaterThan(0)
        }
      }
    }
  })
})

function textOf(document: LegalDoc): string {
  const parts: string[] = [...document.intro]
  for (const section of document.sections) {
    parts.push(section.title)
    for (const block of section.blocks) {
      if (block.type === 'paragraph' || block.type === 'note') parts.push(block.text)
      else if (block.type === 'table') parts.push(...block.head, ...block.rows.flat())
      else parts.push(...block.items)
    }
  }
  return parts.join('\n')
}

describe('the terms state the product facts the code enforces', () => {
  const terms = textOf(doc('terms'))

  it('says the coupon price is paid in full on the site and the remainder at the business', () => {
    expect(terms).toContain('מחיר הקופון משולם לפלטפורמה במלואו')
    expect(terms).toContain('משלם הלקוח ישירות לבית העסק')
  })

  it('says a coupon redeems once', () => {
    expect(terms).toContain('פעם אחת בלבד')
  })

  it('says promotions do not stack', () => {
    expect(terms).toContain('אין כפל מבצעים')
  })

  it('says a set-date deal must be coordinated in advance', () => {
    expect(terms).toContain('תיאום מראש')
  })

  it('says the wallet is site credit, not cash', () => {
    expect(terms).toContain('אינה ניתנת למשיכה')
  })

  it('says card numbers are not stored here', () => {
    expect(terms).toContain('הפלטפורמה אינה שומרת את מספר הכרטיס')
  })

  it('points at Cardcom terms for the clearing step', () => {
    expect(terms).toContain('תנאי השימוש של Cardcom')
  })

  it('never promises escrow, because no money is held for the supplier', () => {
    expect(terms).not.toMatch(/escrow|נאמנות/i)
  })
})

describe('the cancellation policy separates before redemption from after', () => {
  const returns = textOf(doc('returns'))

  it('gives the 14 day distance-selling window', () => {
    expect(returns).toContain('14 יום')
  })

  it('states the statutory fee cap the refund code computes', () => {
    expect(returns).toContain('5%')
    expect(returns).toContain('100 שקלים חדשים')
  })

  it('says a redeemed coupon cannot be cancelled', () => {
    expect(returns).toContain('אינו ניתן לביטול')
  })

  it('says only the amount paid on the site comes back', () => {
    expect(returns).toContain('הסכום ששולם באתר')
  })
})

describe('the privacy policy matches the stack it describes', () => {
  const privacy = textOf(doc('privacy'))

  it('names Amendment 13 and the law', () => {
    expect(privacy).toContain('תיקון מספר 13')
    expect(privacy).toContain('חוק הגנת הפרטיות')
  })

  it('names GDPR and the export/delete endpoints', () => {
    expect(privacy).toContain('GDPR')
    expect(privacy).toContain('/api/account/data-export')
    expect(privacy).toContain('/api/account/data-delete')
  })

  it('lists the cookies by the names the code actually sets', () => {
    for (const cookie of ['ke_session_id', 'ke_consent', 'ke_attr', 'ke_cart_mirror_v1']) {
      expect(privacy).toContain(cookie)
    }
  })

  it('names Google OAuth and the payment processor', () => {
    expect(privacy).toContain('Google OAuth')
    expect(privacy).toContain('Cardcom')
  })

  it('states the section 13 and 14 rights and the answer window', () => {
    expect(privacy).toContain('סעיף 13')
    expect(privacy).toContain('סעיף 14')
    expect(privacy).toContain('30 ימים')
  })
})

describe('the accessibility statement names its standard and its gaps', () => {
  const accessibility = textOf(doc('accessibility'))

  it('names IS 5568 and level AA', () => {
    expect(accessibility).toContain('5568')
    expect(accessibility).toContain('AA')
  })

  it('keeps a known-limitations section rather than claiming perfection', () => {
    expect(doc('accessibility').sections.map((s) => s.id)).toContain('limitations')
  })

  it('says no external audit has been done, while that is true', () => {
    expect(accessibility).toContain('מורשה נגישות שירות')
  })
})

describe('data-rights endpoints exist as routes', () => {
  it('ships GET export and POST delete', () => {
    expect(existsSync(join(process.cwd(), 'src/app/api/account/data-export/route.ts'))).toBe(true)
    expect(existsSync(join(process.cwd(), 'src/app/api/account/data-delete/route.ts'))).toBe(true)
  })
})
