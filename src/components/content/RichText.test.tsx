import RichText from '@/components/content/RichText'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

/**
 * The renderer's job is that operator text can never become markup.
 *
 * `scripts/raw-html-gate.mjs` refuses `dangerouslySetInnerHTML` on
 * request-derived text, and these assertions are the other half of the same
 * rule: they check the OUTPUT rather than the source, so a future refactor that
 * reintroduced an `__html` path here would fail even if it satisfied the gate's
 * allowlist.
 */
describe('RichText', () => {
  const html = (markup: string) => renderToStaticMarkup(<RichText markup={markup} />)

  it('escapes a script tag typed into a body instead of executing it', () => {
    const out = html('<script>alert(1)</script>')
    expect(out).toContain('&lt;script&gt;')
    expect(out).not.toContain('<script>')
  })

  it('escapes an img with an onerror handler, the other classic payload', () => {
    const out = html('<img src=x onerror=alert(1)>')
    expect(out).not.toContain('<img')
    expect(out).toContain('&lt;img')
  })

  it('renders an internal link as an anchor to the path', () => {
    expect(html('ראו [שאלות נפוצות](/faq)')).toContain('href="/faq"')
  })

  it('renders an external link with rel=noreferrer', () => {
    const out = html('[אתר](https://example.test)')
    expect(out).toContain('href="https://example.test"')
    expect(out).toContain('rel="noreferrer"')
  })

  it('does not emit an anchor for a refused href, and keeps the words', () => {
    const out = html('[לחצו כאן](javascript:alert)')
    expect(out).not.toContain('<a')
    expect(out).toContain('לחצו כאן')
  })

  it('renders headings at level two and three only', () => {
    const out = html('## שתיים\n### שלוש\n# אחת')
    expect(out).toContain('<h2')
    expect(out).toContain('<h3')
    // The page title is the only h1. A `#` line is paragraph text.
    expect(out).not.toContain('<h1')
    expect(out).toContain('# אחת')
  })

  it('renders both list kinds with logical padding, not physical', () => {
    expect(html('- פריט')).toContain('<ul')
    expect(html('1. פריט')).toContain('<ol')
    // `ps-6` and not `pl-6`: the document is dir="rtl" and the marker sits on
    // the start side. `scripts/rtl-logical-gate.mjs` enforces the same rule.
    expect(html('- פריט')).toContain('ps-6')
    expect(html('- פריט')).not.toContain('pl-6')
  })

  it('renders nothing at all for an empty body rather than an empty div', () => {
    expect(html('')).toBe('')
    expect(html('   \n  ')).toBe('')
  })
})
