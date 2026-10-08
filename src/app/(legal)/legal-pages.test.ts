import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { PROCESSORS, pendingAgreements } from '@/lib/privacy/processors'
import { CARRIER_IDS, CARRIER_REGISTRY } from '@/lib/shipping/carrier-registry'
import { SHIPPING_METHODS } from '@/lib/shipping/methods'
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
 *    they may not contain;
 *  - a version stamp that disagrees with its own history, or a history that
 *    runs backwards (STEP 51);
 *  - a cookie the code sets and the cookie policy does not list (STEP 51).
 */
const LEGAL_DIR = join(process.cwd(), 'src', 'app', '(legal)', 'legal')
const STORE_DIR = join(process.cwd(), 'src', 'app', '(store)')

function doc(slug: LegalDoc['slug']): LegalDoc {
  const found = LEGAL_DOCS.find((candidate) => candidate.slug === slug)
  if (!found) throw new Error(`missing document: ${slug}`)
  return found
}

describe('every legal document is reachable', () => {
  it.each(LEGAL_DOCS.map((d) => [d.slug, d] as const))(
    '%s is served at its own path by a page that renders it',
    (slug, document) => {
      // The path is a field, not a derivation, so the thing to check is that a
      // page exists AT that path and that it renders THIS document. A path
      // typo here would otherwise be a footer link to a 404.
      expect(document.path).toMatch(/^\/[a-z_-]+$/)
      const page = join(STORE_DIR, document.path.slice(1), 'page.tsx')
      expect(existsSync(page), `${document.path} has no page under (store)`).toBe(true)
      expect(readFileSync(page, 'utf8')).toContain(`getLegalDoc('${slug}')`)
    },
  )

  it('keeps every /legal/* directory a redirect onto a document that exists', () => {
    // The old route group directories are 308 stubs onto the canonical paths.
    // A directory there with no document behind it is an orphan; a document
    // is NOT required to have one (shipping and cookies never lived there).
    const directories = readdirSync(LEGAL_DIR, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
    const slugs = new Set(LEGAL_DOCS.map((d) => d.slug))
    for (const directory of directories) {
      expect(slugs.has(directory as LegalDoc['slug']), `orphan /legal/${directory}`).toBe(true)
      expect(readFileSync(join(LEGAL_DIR, directory, 'page.tsx'), 'utf8')).toContain(
        'permanentRedirect(',
      )
    }
  })

  it('lists the six documents the launch checklist names, in reading order', () => {
    expect(LEGAL_DOCS.map((d) => d.slug)).toEqual([
      'terms',
      'privacy',
      'cookies',
      'returns',
      'shipping',
      'accessibility',
    ])
  })

  it('gives every document a distinct path', () => {
    const paths = LEGAL_DOCS.map((d) => d.path)
    expect(new Set(paths).size).toBe(paths.length)
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

  it('carries a version and an effective date that match the last history entry', () => {
    // The stamp at the top and the table at the bottom are read from the same
    // fields, and this is what keeps them the same fact. A bumped `version`
    // with no history row is the drift this catches.
    expect(document.version).toMatch(/^\d+\.\d+$/)
    expect(document.effectiveAt).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    const current = document.history.at(-1)
    expect(current).toBeDefined()
    expect(current?.version).toBe(document.version)
    expect(current?.effectiveAt).toBe(document.effectiveAt)
  })

  it('keeps the history ascending, with no repeated version', () => {
    const versions = document.history.map((entry) => entry.version)
    expect(new Set(versions).size).toBe(versions.length)
    document.history.forEach((next, index) => {
      expect(next.summary.length, next.version).toBeGreaterThan(20)
      const previous = index > 0 ? document.history[index - 1] : undefined
      if (!previous) return
      expect(
        next.effectiveAt >= previous.effectiveAt,
        `${next.version} predates ${previous.version}`,
      ).toBe(true)
    })
  })

  it('was not updated before it first existed', () => {
    // `updatedAt` moves on a typo fix; `effectiveAt` moves on a new version.
    // The one order that cannot hold is a text last touched before its first
    // version took effect.
    const first = document.history[0]
    expect(first).toBeDefined()
    expect(document.updatedAt >= (first?.effectiveAt ?? '')).toBe(true)
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

  // STEP 31: the sharing table is rendered from the processor register, so
  // every vendor the code can call is named, with its purpose, in the policy.
  it('names every processor in the register, by the name the register gives it', () => {
    for (const processor of PROCESSORS) {
      expect(privacy, `${processor.id} missing from the policy`).toContain(processor.name)
      expect(privacy).toContain(processor.purpose)
    }
  })

  it('describes consent as two categories and says where each can be withdrawn', () => {
    expect(privacy).toContain('מדידת שימוש באתר')
    expect(privacy).toContain('מדידת פרסום')
    expect(privacy).toContain('לכל סוג בנפרד')
    expect(privacy).toContain('פרטיות ונתונים')
  })

  it('names the data processing agreements and the law that requires them', () => {
    expect(privacy).toContain('DPA')
    expect(privacy).toContain('סעיף 17')
    for (const processor of pendingAgreements()) {
      expect(privacy, `${processor.id} is pending and the policy must say so`).toContain(
        processor.name,
      )
      expect(privacy).toContain('בתהליך החתמה')
    }
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
 * STEP 51: the shipping policy restates registries, and the cookie policy is
 * an inventory. Both are checkable against the code they describe.
 */
describe('the shipping policy states what the registries say', () => {
  const shipping = textOf(doc('shipping'))

  it('says coupons are delivered by email, not shipped', () => {
    expect(shipping).toContain('אינם נשלחים בדואר')
    expect(shipping).toContain('QR')
  })

  it('names every shipping method by its registry label and description', () => {
    for (const method of SHIPPING_METHODS) {
      expect(shipping).toContain(method.label)
      expect(shipping).toContain(method.description)
    }
  })

  it('says shipping is free, because every zone is seeded free', () => {
    expect(shipping).toContain('ללא תשלום')
  })

  it('names every carrier service the platform can quote', () => {
    for (const id of CARRIER_IDS) {
      const carrier = CARRIER_REGISTRY[id]
      expect(shipping).toContain(carrier.label)
      for (const service of carrier.services) {
        expect(shipping, `${carrier.label}: ${service.label}`).toContain(service.label)
      }
    }
  })

  it('never promises a delivery faster than the method text does', () => {
    // The method description is "3-7 ימי עסקים"; the bands narrow it, and the
    // page says 7 is the outer edge. A "עד 10 ימי עסקים" here would be a
    // policy promising less than the checkout does.
    expect(shipping).toContain('לא יעלה על 7 ימי עסקים')
  })

  it('counts business days the way the terms do', () => {
    expect(shipping).toContain('ראשון עד חמישי')
  })

  it('sends cancellation and refund questions to the returns policy', () => {
    expect(shipping).toContain('מדיניות הביטולים וההחזרות')
  })
})

/**
 * Every `ke_` key the code declares, found by scanning the source rather than
 * listed here, so a new cookie fails this test until the policy names it.
 */
function declaredBrowserKeys(): string[] {
  const roots = ['src/lib', 'src/components', 'src/server', 'src/app'].map((dir) =>
    join(process.cwd(), dir),
  )
  const found = new Set<string>()
  const visit = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry)
      if (statSync(full).isDirectory()) {
        visit(full)
        continue
      }
      if (!/\.(ts|tsx)$/.test(entry) || /\.test\.|\.spec\./.test(entry)) continue
      // Only the legal content itself is excluded: it is the thing under test.
      if (full.includes(join('(legal)', '_content'))) continue
      const text = readFileSync(full, 'utf8')
      for (const match of text.matchAll(/'(ke_[a-z0-9_]+)'/g)) {
        if (match[1]) found.add(match[1])
      }
    }
  }
  for (const root of roots) if (existsSync(root)) visit(root)
  return [...found].sort()
}

describe('the cookie policy is a complete inventory', () => {
  const cookies = textOf(doc('cookies'))

  it('found the keys it is checking against', () => {
    // A guard on the guard: the scan passing trivially because it stopped
    // finding files is the failure a scanner has.
    const keys = declaredBrowserKeys()
    expect(keys).toContain('ke_session_id')
    expect(keys).toContain('ke_consent')
    expect(keys.length).toBeGreaterThan(10)
  })

  it.each(declaredBrowserKeys())('names %s', (key) => {
    expect(cookies).toContain(key)
  })

  it('names the three categories the consent code has', () => {
    expect(cookies).toContain('הכרחי')
    expect(cookies).toContain('מדידת שימוש באתר')
    expect(cookies).toContain('מדידת פרסום')
  })

  it('says where the decision can be changed, and that DNT is a refusal', () => {
    expect(cookies).toContain('פרטיות ונתונים')
    expect(cookies).toContain('Do Not Track')
    expect(cookies).toContain('Global Privacy Control')
  })

  it('names the vendors that only load after consent', () => {
    for (const vendor of ['PostHog', 'Google Analytics', 'Meta Pixel', 'Cardcom']) {
      expect(cookies).toContain(vendor)
    }
  })

  it('is what the privacy policy defers to', () => {
    expect(textOf(doc('privacy'))).toContain('מדיניות העוגיות')
  })

  it('is what the terms defer to for delivery', () => {
    expect(textOf(doc('terms'))).toContain('מדיניות המשלוחים')
  })
})
