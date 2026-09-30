import { describe, expect, it } from 'vitest'
import {
  MAX_EMPTY_CATEGORIES,
  MAX_EMPTY_TERMS,
  buildEmptyStateSuggestions,
  relaxQuery,
} from './empty-state'

/**
 * The results page's empty state is decided here and rendered elsewhere. These
 * pin what a shopper is offered after a query found nothing, so a change to
 * the ordering or the exclusions is a change to this file first.
 */
describe('relaxQuery', () => {
  it('drops the shortest word of a multi-word query, last one on a tie', () => {
    expect(relaxQuery('עיסוי שוודי זוגי')).toBe('עיסוי שוודי')
    expect(relaxQuery('ארוחת בוקר עם נוף')).toBe('ארוחת בוקר נוף')
    expect(relaxQuery('ספא  יום')).toBe('ספא')
  })

  it('strips an attached prefix letter from a single long word', () => {
    expect(relaxQuery('המסאז')).toBe('מסאז')
    expect(relaxQuery('לצימרים')).toBe('צימרים')
  })

  it('leaves a short word, a prefix-less word and an empty query alone', () => {
    // "בית" would become "ית".
    expect(relaxQuery('בית')).toBeNull()
    expect(relaxQuery('צימר')).toBeNull()
    expect(relaxQuery('')).toBeNull()
    expect(relaxQuery('   ')).toBeNull()
    // Latin words never carry a Hebrew prefix.
    expect(relaxQuery('barbecue')).toBeNull()
  })
})

describe('buildEmptyStateSuggestions', () => {
  const popular = [
    { term: 'ספא', target_url: null },
    { term: 'צימר', target_url: '/category/tzimmerim' },
    { term: 'עיסוי', target_url: null },
  ]
  const categories = [
    { slug: 'spa', name_he: 'ספא' },
    { slug: 'food', name_he: 'אוכל' },
  ]

  it('offers the promoted terms, honouring an operator target, and the categories', () => {
    const s = buildEmptyStateSuggestions({ query: 'barbecue', popular, categories })
    expect(s.terms).toEqual([
      { term: 'ספא', href: '/search?q=%D7%A1%D7%A4%D7%90' },
      { term: 'צימר', href: '/category/tzimmerim' },
      { term: 'עיסוי', href: '/search?q=%D7%A2%D7%99%D7%A1%D7%95%D7%99' },
    ])
    expect(s.categories).toEqual([
      { slug: 'spa', name_he: 'ספא', href: '/category/spa' },
      { slug: 'food', name_he: 'אוכל', href: '/category/food' },
    ])
    expect(s.relaxed).toBeNull()
  })

  it('does not suggest back the term the shopper just searched for', () => {
    const s = buildEmptyStateSuggestions({ query: ' ספא ', popular, categories })
    expect(s.terms.map((t) => t.term)).toEqual(['צימר', 'עיסוי'])
  })

  it('caps both lists and drops blank promoted terms', () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ term: `מונח ${i}`, target_url: null }))
    const cats = Array.from({ length: 20 }, (_, i) => ({ slug: `c${i}`, name_he: `קטגוריה ${i}` }))
    const s = buildEmptyStateSuggestions({
      query: 'x',
      popular: [{ term: '   ', target_url: null }, ...many],
      categories: cats,
    })
    expect(s.terms).toHaveLength(MAX_EMPTY_TERMS)
    expect(s.terms[0]?.term).toBe('מונח 0')
    expect(s.categories).toHaveLength(MAX_EMPTY_CATEGORIES)
  })

  it('carries the relaxed query through', () => {
    const s = buildEmptyStateSuggestions({
      query: 'עיסוי תאילנדי זוגי',
      popular: [],
      categories: [],
    })
    expect(s.relaxed).toBe('עיסוי תאילנדי')
  })
})
