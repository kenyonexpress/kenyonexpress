import {
  excerpt,
  isRenderableHref,
  parseBlocks,
  parseInline,
  plainText,
} from '@/lib/content/markup'
import { describe, expect, it } from 'vitest'

describe('isRenderableHref', () => {
  it('accepts the four shapes an operator legitimately needs', () => {
    expect(isRenderableHref('/faq')).toBe(true)
    expect(isRenderableHref('https://kenyonexpress.co.il')).toBe(true)
    expect(isRenderableHref('mailto:info@kenyonexpress.co.il')).toBe(true)
    expect(isRenderableHref('tel:+972500000000')).toBe(true)
  })

  it('refuses script-bearing schemes, however they are spelled', () => {
    expect(isRenderableHref('javascript:alert(1)')).toBe(false)
    expect(isRenderableHref('JaVaScRiPt:alert(1)')).toBe(false)
    expect(isRenderableHref('data:text/html,<script>')).toBe(false)
    expect(isRenderableHref('vbscript:msgbox')).toBe(false)
    // A tab inside the scheme is the classic bypass of a `startsWith` denylist.
    expect(isRenderableHref('java\tscript:alert(1)')).toBe(false)
  })

  it('refuses the protocol-relative URL that looks site-relative in a text box', () => {
    expect(isRenderableHref('//evil.example/phish')).toBe(false)
  })

  it('refuses plain http, which would downgrade a reader off TLS', () => {
    expect(isRenderableHref('http://kenyonexpress.co.il')).toBe(false)
  })

  it('refuses empty and whitespace', () => {
    expect(isRenderableHref('')).toBe(false)
    expect(isRenderableHref('   ')).toBe(false)
  })
})

describe('parseInline', () => {
  it('reads bold and links', () => {
    expect(parseInline('שלום **עולם** ראו [שאלות](/faq) בבקשה')).toEqual([
      { kind: 'text', text: 'שלום ' },
      { kind: 'strong', text: 'עולם' },
      { kind: 'text', text: ' ראו ' },
      { kind: 'link', text: 'שאלות', href: '/faq' },
      { kind: 'text', text: ' בבקשה' },
    ])
  })

  it('degrades a refused link to its label rather than deleting the words', () => {
    // The href pattern stops at the first `)`, which is the same limitation
    // every `[]()` parser has, so the payload here carries none. A real URL
    // containing a paren is the operator's problem to percent-encode and not a
    // security question: whatever it truncates to still has to pass the
    // allowlist.
    expect(parseInline('לחצו [כאן](javascript:alert) עכשיו')).toEqual([
      { kind: 'text', text: 'לחצו כאן עכשיו' },
    ])
  })

  it('leaves angle brackets as literal characters', () => {
    // The whole reason this module exists: there is no output kind that carries
    // markup, so a script tag in a body is five characters and a word.
    expect(parseInline('<script>alert(1)</script>')).toEqual([
      { kind: 'text', text: '<script>alert(1)</script>' },
    ])
  })

  it('leaves an unmatched asterisk alone instead of refusing the line', () => {
    expect(parseInline('שלוש * ארבע')).toEqual([{ kind: 'text', text: 'שלוש * ארבע' }])
  })
})

describe('parseBlocks', () => {
  it('joins wrapped lines into one paragraph and splits on a blank line', () => {
    expect(parseBlocks('שורה אחת\nשורה שתיים\n\nפסקה שנייה')).toEqual([
      { kind: 'paragraph', spans: [{ kind: 'text', text: 'שורה אחת שורה שתיים' }] },
      { kind: 'paragraph', spans: [{ kind: 'text', text: 'פסקה שנייה' }] },
    ])
  })

  it('reads the two heading levels and refuses a level one', () => {
    const blocks = parseBlocks('## שניים\n### שלושה\n# אחד')
    expect(blocks).toEqual([
      { kind: 'heading', level: 2, spans: [{ kind: 'text', text: 'שניים' }] },
      { kind: 'heading', level: 3, spans: [{ kind: 'text', text: 'שלושה' }] },
      // The page title is the only h1; a `#` line is paragraph text.
      { kind: 'paragraph', spans: [{ kind: 'text', text: '# אחד' }] },
    ])
  })

  it('groups consecutive items of the same kind and starts a new list on a change', () => {
    const blocks = parseBlocks('- א\n- ב\n1. ג\n2. ד')
    expect(blocks).toEqual([
      {
        kind: 'list',
        ordered: false,
        items: [[{ kind: 'text', text: 'א' }], [{ kind: 'text', text: 'ב' }]],
      },
      {
        kind: 'list',
        ordered: true,
        items: [[{ kind: 'text', text: 'ג' }], [{ kind: 'text', text: 'ד' }]],
      },
    ])
  })

  it('reads a quote across lines', () => {
    expect(parseBlocks('> ראשון\n> שני')).toEqual([
      { kind: 'quote', spans: [{ kind: 'text', text: 'ראשון שני' }] },
    ])
  })

  it('returns nothing for an empty body rather than an empty paragraph', () => {
    expect(parseBlocks('')).toEqual([])
    expect(parseBlocks('   \n\n  ')).toEqual([])
  })

  it('normalises CRLF, which is what a Windows paste carries', () => {
    expect(parseBlocks('אחת\r\n\r\nשתיים')).toHaveLength(2)
  })
})

describe('plainText and excerpt', () => {
  it('flattens every block kind into words', () => {
    expect(plainText('## כותרת\n\nפסקה **מודגשת**\n\n- פריט')).toBe('כותרת פסקה מודגשת פריט')
  })

  it('returns a short body unchanged', () => {
    expect(excerpt('שלום עולם')).toBe('שלום עולם')
  })

  it('cuts on a word boundary and marks the cut', () => {
    const long = `${'מילה '.repeat(60)}`
    const cut = excerpt(long)
    expect(cut.length).toBeLessThanOrEqual(161)
    expect(cut.endsWith('…')).toBe(true)
    expect(cut).not.toContain('מיל…')
  })
})
