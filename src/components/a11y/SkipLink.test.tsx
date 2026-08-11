import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import SkipLink from './SkipLink'

/**
 * WCAG 2.4.1 Bypass Blocks, which Israeli standard 5568 adopts. The store
 * header repeats a masthead, search, category menu and nav row on every page.
 */
describe('SkipLink', () => {
  const html = renderToStaticMarkup(<SkipLink />)

  it('points at the main landmark the layout defines', () => {
    expect(html).toContain('href="#main-content"')
  })

  it('is in Hebrew', () => {
    expect(html).toContain('דילוג לתוכן הראשי')
  })

  it('is hidden until focused, and genuinely visible when it is', () => {
    // sr-only alone would keep it hidden even while focused, which is the
    // classic broken skip link: it takes the Tab stop and shows nothing.
    expect(html).toContain('sr-only')
    expect(html).toContain('focus:not-sr-only')
    // Colour alone is not enough; the focused state must restore geometry.
    expect(html).toMatch(/focus:h-auto/)
    expect(html).toMatch(/focus:w-auto/)
  })

  it('sits on the right, because the document is RTL', () => {
    expect(html).toContain('focus:right-4')
    expect(html).not.toContain('focus:left-4')
  })

  it('keeps a visible focus ring', () => {
    // focus:outline-none without a replacement is how a focus indicator gets
    // deleted; the ring is the replacement.
    expect(html).toContain('focus:ring-2')
  })
})
