import { describe, expect, it } from 'vitest'
import { REVIEWED, classifyUtility, scanRtlLogical } from './rtl-logical-scan.mjs'

/**
 * THE GATE FOR PHYSICAL DIRECTION UTILITIES, AND THE CASE THAT MAKES THE
 * OBVIOUS VERSION OF IT WRONG.
 *
 * The document is `<html lang="he" dir="rtl">`. In it `mr-2` and `ms-2` render
 * identically and `text-right` and `text-start` render identically, so the
 * physical spelling is not a bug today. It is a bug waiting for the first
 * `dir="ltr"` island to grow around it.
 *
 * MEASURED 2026-09-09: 160 logical utilities against 26 physical, in 19 files.
 * Thirteen were rendering-identical and were converted.
 *
 * THE OTHER THIRTEEN ARE CORRECT, AND ONE GROUP OF THEM IS THE POINT.
 * `SupplierLeadForm` has three inputs carrying `dir="ltr"` -- a phone, an email
 * and a URL, LTR content inside an RTL form -- and each also carries
 * `text-right` so the LTR text still lines up with the Hebrew fields around it.
 * **Inside `dir="ltr"`, `start` means LEFT.** Converting those three to
 * `text-start` would left-align all three and break the form.
 *
 * SECTIONS 18 asked for "logical properties everywhere, no left/right". Applied
 * literally that is the conversion above, and it is a visual regression. This
 * is why the scan reads the element's own attributes and not only its classes,
 * and why the test below exists before the convenience of a blanket sweep.
 */

describe('what a physical utility means in an RTL document', () => {
  it('flags the plain case', () => {
    expect(classifyUtility('mr-2')).toEqual({ ok: false, reason: 'physical-in-an-rtl-document' })
    expect(classifyUtility('text-right').ok).toBe(false)
    expect(classifyUtility('md:pl-4').ok).toBe(false)
  })

  it('leaves the logical spellings alone', () => {
    for (const token of ['ms-2', 'me-auto', 'ps-4', 'text-start', 'border-s', 'end-0']) {
      expect(classifyUtility(token)).toEqual({ ok: true, reason: 'not-physical' })
    }
  })

  it('DIR_LTR_ISLAND: physical is CORRECT inside dir="ltr"', () => {
    // The three SupplierLeadForm inputs. `start` is LEFT in there, so
    // `text-start` would left-align an LTR field inside an RTL form.
    expect(classifyUtility('text-right', { elementHasLtr: true })).toEqual({
      ok: true,
      reason: 'inside-dir-ltr',
    })
  })

  it('CENTERING_IS_NOT_A_DIRECTION: the half-offset idiom passes', () => {
    // left-1/2 with -translate-x-1/2 centres. There is no logical equivalent
    // and no direction being expressed.
    expect(classifyUtility('left-1/2').reason).toBe('centering-idiom')
    expect(classifyUtility('max-lg:left-1/2').reason).toBe('centering-idiom')
    expect(classifyUtility('right-1/2').reason).toBe('centering-idiom')
  })

  it('honours a reviewed token only in the file it was reviewed in', () => {
    const file = 'src/components/a11y/SkipLink.tsx'
    expect(classifyUtility('focus:right-4', { file }).reason).toBe('reviewed')
    // The same token in a file nobody has read must not inherit the argument.
    expect(classifyUtility('focus:right-4', { file: 'src/components/Other.tsx' }).ok).toBe(false)
  })
})

describe('the reviewed list', () => {
  it('carries a real argument for every entry', () => {
    for (const [file, tokens] of REVIEWED) {
      expect(file.startsWith('src/')).toBe(true)
      for (const [token, reason] of tokens) {
        expect(token.length).toBeGreaterThan(0)
        // A one-word note is a rubber stamp. These have to survive a year.
        expect(reason.length).toBeGreaterThan(80)
      }
    }
  })
})

describe('the repository as it stands', () => {
  it('has no physical direction utility outside an LTR island', () => {
    expect(scanRtlLogical()).toEqual([])
  })
})
