import { XMLParser } from 'fast-xml-parser'
import { describe, expect, it } from 'vitest'
import { cdata, escapeXml, rfc822, tag } from './xml'

/**
 * Escaping is the whole risk in a feed: one unescaped `&` makes the FILE
 * unparseable, not the item, and neither Google nor an RSS reader says which
 * product did it. So the assertions here parse the result rather than compare
 * strings — a string comparison would pass on output no consumer can read.
 */

const parser = new XMLParser({ ignoreAttributes: false })

describe('escapeXml', () => {
  it('escapes the five predefined entities', () => {
    expect(escapeXml(`&<>"'`)).toBe('&amp;&lt;&gt;&quot;&apos;')
  })

  it('escapes the ampersand first, so nothing is escaped twice', () => {
    // `<` -> `&lt;` introduces an ampersand. Escaping `&` after that would
    // produce `&amp;lt;` and render as literal `&lt;` on the page.
    expect(escapeXml('<')).toBe('&lt;')
    expect(escapeXml('&lt;')).toBe('&amp;lt;')
  })

  it('leaves Hebrew alone', () => {
    expect(escapeXml('ארוחה זוגית')).toBe('ארוחה זוגית')
  })

  it('survives the shop name that breaks feeds', () => {
    // "קפה & מאפה" is an ordinary business name here, and it is exactly the
    // input that produces a document nothing can parse.
    const xml = `<item>${tag('title', 'קפה & מאפה')}</item>`
    expect(parser.parse(xml).item.title).toBe('קפה & מאפה')
  })

  it('drops control characters rather than escaping them', () => {
    // `&#x0;` is not legal XML either, so escaping would produce the same
    // unparseable file by a longer route.
    expect(escapeXml('a\u0000b\u0008c')).toBe('abc')
  })

  it('keeps tab, newline and carriage return, which are legal', () => {
    expect(escapeXml('a\tb\nc\rd')).toBe('a\tb\nc\rd')
  })
})

describe('tag', () => {
  it('emits nothing for null, undefined or blank', () => {
    expect(tag('x', null)).toBe('')
    expect(tag('x', undefined)).toBe('')
    expect(tag('x', '   ')).toBe('')
  })

  it('emits a zero, which is a value and not an absence', () => {
    expect(tag('x', 0)).toBe('<x>0</x>')
  })

  it('trims, so a stray newline in a column does not reach the feed', () => {
    expect(tag('x', '  hi\n')).toBe('<x>hi</x>')
  })
})

describe('cdata', () => {
  it('wraps and parses back byte for byte', () => {
    const xml = `<r>${cdata('d', 'a <b> & c')}</r>`
    expect(parser.parse(xml).r.d).toBe('a <b> & c')
  })

  it('splits the one sequence that can close the section early', () => {
    // There is no escape for `]]>` inside CDATA — a backslash or an entity is a
    // literal there — so it has to be split across two sections.
    const xml = `<r>${cdata('d', 'oops ]]> out')}</r>`
    expect(xml).not.toMatch(/\]\]>\s*out/)
    expect(parser.parse(xml).r.d).toBe('oops ]]> out')
  })

  it('emits nothing for an empty description', () => {
    expect(cdata('d', '')).toBe('')
    expect(cdata('d', null)).toBe('')
  })
})

describe('rfc822', () => {
  it('is the format RSS pubDate requires', () => {
    expect(rfc822(new Date('2026-08-06T09:00:00Z'))).toBe('Thu, 06 Aug 2026 09:00:00 GMT')
  })
})
