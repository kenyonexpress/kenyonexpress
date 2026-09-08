import { readFileSync, readdirSync } from 'node:fs'
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

  it('lists the five documents the launch checklist names', () => {
    expect(LEGAL_DOCS.map((d) => d.slug)).toEqual([
      'terms',
      'privacy',
      'cookies',
      'returns',
      'accessibility',
    ])
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

/**
 * THE COOKIE TABLE MUST EQUAL THE COOKIES THE CODE ACTUALLY SETS.
 *
 * This is the only legal text in the repo that goes stale by editing a
 * different file. Nobody re-reads a policy when they add a cookie, and the
 * privacy policy's own table proved it: it disclosed four of the nine `ke_*`
 * identifiers that existed in `src/`, and the five it missed included a
 * measurement id readable by any script on the page.
 *
 * So the disclosure is checked against the source rather than trusted. The
 * source of truth is every `'ke_*'` string literal under `src/`, excluding the
 * legal content itself (which quotes them) and the tests (which assert on
 * them). Adding a cookie without disclosing it fails here, by name.
 */
describe('the cookie policy discloses every identifier the code stores', () => {
  const SRC = join(process.cwd(), 'src')

  function walk(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) walk(full, out)
      else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full)
    }
    return out
  }

  /** Identifiers the code writes to a cookie, localStorage or sessionStorage. */
  function identifiersInSource(): Set<string> {
    const found = new Set<string>()
    for (const file of walk(SRC)) {
      // The policy quotes these; the tests assert on them. Neither defines one.
      if (file.includes(`${join('(legal)', '_content')}`)) continue
      if (/\.(test|spec)\.tsx?$/.test(file)) continue
      for (const match of readFileSync(file, 'utf8').matchAll(/'(ke_[a-zA-Z0-9_]+)'/g)) {
        found.add(match[1] as string)
      }
    }
    return found
  }

  const disclosed = new Set(
    [...textOf(doc('cookies')).matchAll(/\bke_[a-zA-Z0-9_]+/g)].map((m) => m[0]),
  )

  it('discloses every ke_* identifier that exists in src/', () => {
    const missing = [...identifiersInSource()].filter((id) => !disclosed.has(id)).sort()
    expect(missing, `undisclosed browser storage: ${missing.join(', ')}`).toEqual([])
  })

  it('does not disclose an identifier the code no longer sets', () => {
    const inSource = identifiersInSource()
    const stale = [...disclosed].filter((id) => !inSource.has(id)).sort()
    expect(stale, `disclosed but gone from the code: ${stale.join(', ')}`).toEqual([])
  })

  it('gives every disclosed identifier a lifetime, not just a name', () => {
    // A four-column table whose rows are name/kind/purpose/lifetime. A row that
    // names a cookie and leaves the retention blank is the half-disclosure the
    // Privacy Protection Regulations are specifically about.
    for (const section of doc('cookies').sections) {
      for (const block of section.blocks) {
        if (block.type !== 'table') continue
        for (const row of block.rows) {
          expect(row.at(-1)?.trim(), `${section.id}: ${row[0]}`).toBeTruthy()
        }
      }
    }
  })
})
