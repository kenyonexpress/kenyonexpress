import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { SITE } from '@/styles/tokens'
import { describe, expect, it } from 'vitest'

/**
 * The three pages a customer sees when something has already gone wrong.
 *
 * WHY THEY NEED A GATE AT ALL. Every one of them replaced a Next.js built-in
 * that rendered English, left-to-right, unstyled, into a Hebrew RTL storefront.
 * That is the state they revert to by deletion, and nothing else in the suite
 * visits them: they are unreachable by definition in a passing test run, so a
 * regression here is invisible until a customer hits it on the worst page of
 * their session.
 *
 * Source-scanned rather than rendered. `global-error.tsx` supplies its own
 * <html>, `error.tsx` is a client boundary needing a thrown error and a reset
 * callback, and what is being defended is the presence of specific attributes
 * and copy - which is exactly what reading the source settles.
 */

const read = (file: string) => readFileSync(resolve(process.cwd(), 'src/app', file), 'utf8')

const PAGES = [
  ['not-found.tsx', read('not-found.tsx')],
  ['error.tsx', read('error.tsx')],
  ['global-error.tsx', read('global-error.tsx')],
] as const

describe.each(PAGES)('%s', (_file, src) => {
  it('is right-to-left', () => {
    // The failure this prevents is the specific one each page was written to
    // fix: Next's fallback is LTR, and an error page that flips direction is
    // how a Hebrew customer learns the site is broken before reading a word.
    expect(src).toContain('dir="rtl"')
  })

  it('speaks Hebrew', () => {
    expect(src).toMatch(/[א-ת]{3,}/)
  })

  it('offers a way out rather than being a dead end', () => {
    // Somebody on one of these pages wanted something. A page that only
    // apologises makes leaving the site the easiest available action.
    expect(src).toMatch(/href="\/|window\.location\.assign\('\/'\)|reset\(\)/)
  })

  it('is not indexable as a real page', () => {
    // A 404 or a 500 in a search result is worse than no result. not-found
    // says so in metadata; the two error boundaries are never served with a
    // 200, so the check is that neither invites indexing.
    expect(src).not.toMatch(/index:\s*true/)
  })
})

describe('the error pages look like the same storefront', () => {
  it('leads with the status code in the brand yellow, on both', () => {
    // These used to look like two different sites: the 404 painted its numeral
    // brand-primary and the 500 led with a grey warning emoji. A customer who
    // hits both in one session should see one shop.
    expect(read('not-found.tsx')).toContain('text-brand-primary')
    expect(read('error.tsx')).toContain('text-brand-primary')
  })

  it('uses design tokens, not raw Tailwind greys, for text and borders', () => {
    // `text-gray-500` and `border-gray-300` are not the palette the rest of the
    // storefront paints; `text-muted` and `border-border` are. The tokens gate
    // does not catch this - a Tailwind grey is not a raw hex.
    for (const file of ['not-found.tsx', 'error.tsx']) {
      const src = read(file)
      expect(src, `${file} still uses a raw grey for body text`).not.toMatch(
        /className="[^"]*\btext-gray-(400|500|700|900)\b/,
      )
      expect(src, `${file} still uses a raw grey border`).not.toMatch(
        /className="[^"]*\bborder-gray-\d+\b/,
      )
    }
  })
})

describe('global-error survives the failure it exists for', () => {
  const src = read('global-error.tsx')

  it('supplies its own html lang and dir, because the layout is what threw', () => {
    // error.tsx cannot catch a throwing root layout - that boundary lives
    // INSIDE the layout. So this file is rendered without one, and has to
    // carry the two attributes the layout would have set.
    expect(src).toContain('<html lang="he" dir="rtl">')
  })

  it('depends on no stylesheet', () => {
    // The failure may well BE the stylesheet. Every rule here is inline.
    expect(src).toContain('style={{')
    expect(src).not.toMatch(/className=/)
  })

  it('carries the brand yellow as a value, in step with the stylesheet', () => {
    // A literal would drift; the import cannot, and styles/tokens.ts is plain
    // data with no CSS behind it, so it survives a dead stylesheet.
    expect(src).toContain('SITE.brand.primary')
    expect(SITE.brand.primary.toLowerCase()).toBe('#fed700')
  })

  it('does not claim a font the dead layout was carrying', () => {
    // Heebo arrives as a next/font class on <html> set by the root layout -
    // the thing that just threw. Naming it here would resolve to nothing.
    //
    // Comments are stripped first: this file EXPLAINS why it does not use
    // Heebo, and an assertion that cannot tell an explanation from a
    // declaration would forbid documenting the decision.
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
    expect(code).not.toMatch(/Heebo|--font-heebo/)
    expect(code).toContain('system-ui')
  })

  it('reports to Sentry, since nothing else on this path can', () => {
    expect(src).toContain('Sentry.captureException')
  })
})
