import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { JsonLdNode } from '@/lib/seo/json-ld'
import { describe, expect, it } from 'vitest'
import { buildAboutJsonLd } from './_components/AboutJsonLd'
import { buyerSteps, paymentSections, supplierSteps, whyItIsCheap } from './_content/trust'

/**
 * The trust pages, guarded where they can actually go wrong.
 *
 * `src/app/content-pages.test.ts` already asserts the shared frame and the SEO
 * fields for `/about`, and this file extends the same two checks to the two
 * pages under it rather than restating them. What it adds is the part no frame
 * check can see: whether the pages still say what the code does.
 */

const ABOUT = join(process.cwd(), 'src', 'app', '(store)', 'about')

function source(...segments: string[]): string {
  return readFileSync(join(ABOUT, ...segments), 'utf8')
}

const NEW_PAGES: [name: string, path: string[]][] = [
  ['how it works', ['how-it-works', 'page.tsx']],
  ['payment security', ['payment-security', 'page.tsx']],
]

describe('the pages under /about use the measured frame', () => {
  for (const [name, path] of NEW_PAGES) {
    it(`${name} uses the same page container as /faq`, () => {
      expect(source(...path)).toContain('mx-auto w-full max-w-page px-4 py-10')
    })

    it(`${name} keeps body copy at the same measure`, () => {
      expect(source(...path)).toContain('max-w-3xl')
    })

    it(`${name} declares a canonical URL and a description`, () => {
      const text = source(...path)
      expect(text).toContain('alternates:')
      expect(text).toContain('canonical:')
      expect(text).toContain('description:')
    })
  }
})

describe('the pages under /about are reachable', () => {
  const footer = readFileSync(
    join(process.cwd(), 'src', 'components', 'layout', 'SiteFooter.tsx'),
    'utf8',
  )
  const sitemap = readFileSync(join(process.cwd(), 'src', 'app', 'sitemap.ts'), 'utf8')

  for (const href of ['/about/how-it-works', '/about/payment-security']) {
    // A page in the sitemap and nowhere else is a page Google finds and a
    // customer does not. The reverse is worse: a trust page nobody can index.
    it(`${href} is linked from the footer`, () => {
      expect(footer).toContain(`href: '${href}'`)
    })

    it(`${href} is in the sitemap`, () => {
      expect(sitemap).toContain(href)
    })
  }
})

describe('the flows are three steps each, as the page promises', () => {
  it.each([
    ['buyer', buyerSteps],
    ['supplier', supplierSteps],
  ])('the %s flow has exactly three steps', (_name, steps) => {
    // The headings say "three steps". A fourth added to the array would make
    // the page contradict itself in the one place a reader is counting.
    expect(steps).toHaveLength(3)
  })

  it('every step has a drawing that exists', () => {
    const drawings = source('_components', 'StepIllustration.tsx')
    for (const step of [...buyerSteps, ...supplierSteps]) {
      expect(drawings).toContain(`${step.icon}:`)
    }
  })
})

/**
 * The three claims the content module refuses to make, asserted as refusals.
 *
 * These are not style checks. Each one is a sentence that would be false about
 * this codebase, and each has a specific reason it is tempting to write.
 */
describe('the trust copy makes no claim the code contradicts', () => {
  const copy = [
    ...whyItIsCheap.paragraphs,
    ...paymentSections.flatMap((section) => [section.heading, ...section.paragraphs]),
  ].join('\n')

  it('never claims the money is held until redemption', () => {
    // The escrow model was abolished on 2026-07-28; see
    // src/lib/supplier/no-escrow-in-supplier-due.test.ts. A coupon prepayment
    // settles at payment time, nothing is held and nothing is released on a
    // scan. "The money is held until you redeem" is the single most damaging
    // false sentence this site could publish.
    expect(copy).not.toMatch(/הכסף (?:שלכם )?מוחזק|מוחזק אצלנו|משוחרר (?:רק )?לאחר המימוש/)
  })

  it('says out loud that there is no escrow here', () => {
    // Silence would be worse than the false claim in one respect: a reader who
    // assumes escrow is a reader who finds out during a dispute.
    expect(copy).toContain('escrow')
    expect(copy).toMatch(/אין הסדר כזה/)
  })

  it('claims no superlative about every other price in Israel', () => {
    // "The cheapest deals in Israel" is a comparative advertising claim about
    // competitors that nothing in this repository can substantiate, and it goes
    // stale the day somebody else discounts. The mechanism is what is claimed.
    expect(copy).not.toMatch(/הזול(?:ים)? (?:ביותר|בישראל)|הכי זול/)
  })
})

describe('the structured data points at something', () => {
  const nodes = buildAboutJsonLd(
    { path: '/about/how-it-works', name: 'איך זה עובד', description: 'תיאור' },
    'https://kenyonexpress.co.il/',
  )

  /**
   * `nodes[0]` is `T | undefined` under `noUncheckedIndexedAccess`, and a test
   * that optional-chains past a missing node passes when the builder returns
   * nothing at all. This throws instead, so a shrunk array fails loudly.
   */
  function node(index: number): JsonLdNode {
    const found = nodes[index]
    if (!found) throw new Error(`buildAboutJsonLd returned no node at ${index}`)
    return found
  }

  it('emits exactly an Organization and an AboutPage', () => {
    expect(nodes).toHaveLength(2)
    expect(node(0)['@type']).toBe('Organization')
    expect(node(1)['@type']).toBe('AboutPage')
  })

  it('resolves the AboutPage against the Organization by id', () => {
    // A bare `about: {"@type": "Organization"}` with only a name is a dangling
    // reference, and the whole value of an AboutPage node is the entity it
    // names. The two must agree on one @id.
    expect(node(0)['@id']).toBe('https://kenyonexpress.co.il/#organization')
    expect(node(1).about).toEqual({ '@id': 'https://kenyonexpress.co.il/#organization' })
  })

  it('strips the trailing slash from the origin', () => {
    // `//about/how-it-works` is a protocol-relative URL to a host called
    // `about`, which resolves for a crawler and 404s for everyone.
    expect(node(1).url).toBe('https://kenyonexpress.co.il/about/how-it-works')
  })

  it('carries the page description rather than a second copy of it', () => {
    expect(node(1).description).toBe('תיאור')
  })
})
