import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { computeCancellationFee } from '@/server/domain/orders/refund'

/**
 * This site serves TWO complete sets of legal documents, and this pins that
 * fact so it cannot get worse quietly.
 *
 * `legal-routes.test.ts` next door says what it is defending against: "Two
 * routes rendering one cancellation policy drift, and then the site states two
 * different sets of terms about a consumer's right to cancel, which is exactly
 * the kind of contradiction the Consumer Protection Law makes expensive." It
 * then only asserts that three redirects exist. A whole second set of documents
 * arriving on paths it never heard of goes straight past it, which is what
 * happened when `feat/legal-pages` merged.
 *
 * WHAT THIS FILE DOES NOT DO. It does not fail the build over the duplication.
 * Choosing which text binds the company is Ofir's decision with counsel, and a
 * red CI does not make that decision arrive sooner; it just stops everything
 * else. So the duplication is recorded here as a KNOWN state, with the two
 * properties that actually keep customers safe held true by assertion:
 *
 *   1. no THIRD set appears, and neither set grows a new document unnoticed
 *   2. the two cancellation policies keep saying the same thing about money,
 *      and both keep matching the code that actually charges it
 *
 * When the sets are unified, this file gets shorter, not deleted: the
 * inventory assertion is still the thing that notices a fourth terms page.
 */

const CANONICAL = [
  'src/app/(store)/accessibility/page.tsx',
  'src/app/(store)/privacy-policy/page.tsx',
  'src/app/(store)/refund_returns/page.tsx',
  'src/app/(store)/terms-and-conditions/page.tsx',
]

/**
 * Live, but linked from nowhere: `SiteFooter` points at the set above. Marked
 * `robots: noindex` in `src/app/(legal)/layout.tsx` until somebody chooses.
 */
const UNLINKED = [
  'src/app/(legal)/legal/accessibility/page.tsx',
  'src/app/(legal)/legal/privacy/page.tsx',
  'src/app/(legal)/legal/returns/page.tsx',
  'src/app/(legal)/legal/terms/page.tsx',
]

function walk(dir: string): string[] {
  let found: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      found = found.concat(walk(full))
      continue
    }
    if (entry === 'page.tsx') found.push(full)
  }
  return found
}

/** Every page that renders a legal document, found rather than listed. */
function legalPages(): string[] {
  const cwd = process.cwd()
  return walk(resolve(cwd, 'src/app'))
    .map((file) => relative(cwd, file).split('\\').join('/'))
    .filter((file) => /terms|privacy|accessib|refund_returns|legal\//.test(file))
    .filter((file) => !file.includes('/checkout/'))
    .sort()
}

describe('the legal document inventory', () => {
  it('is exactly the two sets we know about', () => {
    // A third set, or a fifth document in either set, fails here and has to be
    // added deliberately. That is the whole job of this assertion.
    expect(legalPages()).toEqual([...UNLINKED, ...CANONICAL].sort())
  })

  it('keeps the canonical set the one the footer links', () => {
    const footer = readFileSync(
      resolve(process.cwd(), 'src/components/layout/SiteFooter.tsx'),
      'utf8',
    )
    for (const href of ['/terms-and-conditions', '/privacy-policy', '/refund_returns']) {
      expect(footer, `SiteFooter no longer links ${href}`).toContain(href)
    }
    // If the footer ever points at /legal/*, the unlinked set has been promoted
    // and the noindex in (legal)/layout.tsx is now actively wrong.
    expect(
      footer.includes('/legal/'),
      'SiteFooter links /legal/* — that set is marked noindex. Promote it properly or revert the link.',
    ).toBe(false)
  })

  it('keeps the unlinked set out of the index while it is a duplicate', () => {
    const layout = readFileSync(resolve(process.cwd(), 'src/app/(legal)/layout.tsx'), 'utf8')
    expect(
      /robots:\s*\{[^}]*index:\s*false/.test(layout),
      'src/app/(legal)/layout.tsx no longer sets robots.index=false, so a search engine can now present a second set of terms for this site.',
    ).toBe(true)
  })
})

describe('the two cancellation policies agree about money', () => {
  const older = readFileSync(resolve(process.cwd(), 'src/content/legal/cancellation.ts'), 'utf8')
  const newer = readFileSync(resolve(process.cwd(), 'src/app/(legal)/_content/returns.ts'), 'utf8')

  it.each([
    ['the older policy at /refund_returns', older],
    ['the newer policy at /legal/returns', newer],
  ])('%s states 5%% capped at 100 shekels', (_label, text) => {
    expect(text).toMatch(/5%/)
    expect(text).toMatch(/100/)
  })

  /**
   * Both documents do not merely state the rate, they claim the SYSTEM applies
   * it. That is a checkable claim about `computeCancellationFee`, and if the
   * constants move, two published legal documents start lying at once.
   */
  it('and the code charges what both of them promise', () => {
    // 5% while under the cap.
    expect(computeCancellationFee(100_00, false)).toBe(5_00)
    // The cap binds above 2,000 shekels, where 5% would exceed 100.
    expect(computeCancellationFee(5_000_00, false)).toBe(100_00)
    // Exactly at the crossover.
    expect(computeCancellationFee(2_000_00, false)).toBe(100_00)
    // A defect claim is free, which both documents also promise.
    expect(computeCancellationFee(100_00, true)).toBe(0)
  })
})
