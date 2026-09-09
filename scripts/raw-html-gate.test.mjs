import { describe, expect, it } from 'vitest'
import {
  SAFE_CONSTANTS,
  classifyHtmlValue,
  htmlValueOnLine,
  scanRawHtml,
} from './raw-html-scan.mjs'

/**
 * THE GATE THAT KEEPS STORED XSS OUT OF HEBREW CATALOGUE COPY.
 *
 * MEASURED 2026-09-09: ten files in `src/` name `dangerouslySetInnerHTML` and
 * every one of them is already safe. Eight pass `jsonLdScript(...)`, one passes
 * the module constant `CONSENT_PREPAINT_SCRIPT`, and two of the ten hits are
 * comments in the legal renderer saying it deliberately does not do this.
 *
 * So this gate protects a property rather than repairing one, and the thing it
 * is aimed at is a single future line that would look native among the eight:
 *
 *     <div dangerouslySetInnerHTML={{ __html: `<p>${product.description_he}</p>` }} />
 *
 * Product descriptions are authored in the admin panel, so that is stored XSS
 * reachable from a form, and `biome` has no rule against it.
 *
 * The trap held shut here is the bare identifier. `__html: SOME_CONSTANT` is
 * refused unless the name is in `SAFE_CONSTANTS`, and `__html: someValue` is
 * refused outright even when it holds a literal today, because the failure mode
 * is that the value stops being constant in a later commit while the call site
 * is never touched again.
 */

describe('what may be injected as raw HTML', () => {
  it('accepts the one sanctioned serializer', () => {
    // jsonLdScript escapes `<` to <, which is what stops a </script>
    // breakout out of a JSON-LD block. See src/lib/seo/json-ld.ts.
    expect(classifyHtmlValue('jsonLdScript(node)')).toEqual({ ok: true, reason: 'jsonLdScript' })
    expect(classifyHtmlValue('jsonLdScript(productLd)').ok).toBe(true)
  })

  it('STORED_XSS: refuses a template literal, which is the whole point', () => {
    const verdict = classifyHtmlValue('`<p>${product.description_he}</p>`')
    expect(verdict.ok).toBe(false)
    expect(verdict.reason).toBe('template-literal')
  })

  it('refuses concatenation, which is the same defect spelled differently', () => {
    expect(classifyHtmlValue("'<p>' + description + '</p>'").ok).toBe(false)
    expect(classifyHtmlValue("'<p>' + description + '</p>'").reason).toBe('concatenation')
  })

  it('refuses any other serializer, however safe its name sounds', () => {
    // `sanitize(x)` and `renderMarkdown(x)` are the two that would be waved
    // through by a reviewer and neither is jsonLdScript.
    expect(classifyHtmlValue('sanitize(body)').ok).toBe(false)
    expect(classifyHtmlValue('renderMarkdown(post.body_he)').ok).toBe(false)
    expect(classifyHtmlValue('product.description_html').ok).toBe(false)
  })

  it('BARE_IDENTIFIER: refuses a constant that is not on the list', () => {
    expect(classifyHtmlValue('CONSENT_PREPAINT_SCRIPT')).toEqual({
      ok: true,
      reason: 'allowlisted-constant',
    })
    const verdict = classifyHtmlValue('ANALYTICS_BOOTSTRAP')
    expect(verdict.ok).toBe(false)
    expect(verdict.reason).toBe('constant-not-in-allowlist')
  })

  it('refuses a lowercase variable even though it may hold a literal today', () => {
    // The failure mode is entirely in the future: the variable is reassigned
    // from a request, and this line never appears in that diff.
    expect(classifyHtmlValue('script').ok).toBe(false)
    expect(classifyHtmlValue('script').reason).toBe('unreviewed-expression')
  })

  it('keeps the allowlist short enough to read', () => {
    // A long allowlist is the same as no gate. If this ever needs raising,
    // that is the moment to ask why raw HTML is spreading.
    expect(SAFE_CONSTANTS.size).toBeLessThanOrEqual(3)
  })
})

describe('which lines are call sites', () => {
  it('reads the value out of the common single-line form', () => {
    expect(htmlValueOnLine('  dangerouslySetInnerHTML={{ __html: jsonLdScript(node) }}')).toBe(
      'jsonLdScript(node)',
    )
  })

  it('reads a value left open at the end of the line', () => {
    expect(htmlValueOnLine('  __html: jsonLdScript(')).toBe('jsonLdScript(')
  })

  it('ignores prose about not using raw HTML', () => {
    // Two of the ten measured hits are exactly this, in the legal renderer.
    // Counting them would make the gate red on a comment.
    expect(htmlValueOnLine(' * into `dangerouslySetInnerHTML` would mean a binding document')).toBe(
      null,
    )
    expect(htmlValueOnLine(' * Blocks in, React out - no `dangerouslySetInnerHTML`.')).toBe(null)
  })
})

describe('the repository as it stands', () => {
  it('has no unreviewed raw HTML in src/', () => {
    // Measured 2026-09-09: clean. This assertion is what makes the next one
    // fail loudly rather than the gate quietly gaining an exception.
    expect(scanRawHtml()).toEqual([])
  })
})
