import { describe, expect, it } from 'vitest'
import { escapeLikePattern, likeContains, sanitizeOrTerm } from './search-escape'

describe('escapeLikePattern', () => {
  // The bug: admin searches interpolated the term straight into an ILIKE
  // pattern, so % and _ acted as wildcards instead of literal characters.
  it('escapes the % wildcard', () => {
    expect(escapeLikePattern('50%')).toBe('50\\%')
  })

  it('escapes the _ single-character wildcard', () => {
    expect(escapeLikePattern('a_b')).toBe('a\\_b')
  })

  it('escapes the escape character itself, without double-escaping', () => {
    expect(escapeLikePattern('a\\b')).toBe('a\\\\b')
  })

  it('drops * because PostgREST maps it onto %', () => {
    expect(escapeLikePattern('a*b')).toBe('ab')
  })

  it('leaves ordinary text untouched', () => {
    expect(escapeLikePattern('כיסא נוח')).toBe('כיסא נוח')
    expect(escapeLikePattern('Sony WH-1000')).toBe('Sony WH-1000')
  })
})

describe('likeContains', () => {
  it('wraps the escaped term in unescaped wildcards', () => {
    expect(likeContains('50%')).toBe('%50\\%%')
  })

  it('matches a plain term as a substring', () => {
    expect(likeContains('שולחן')).toBe('%שולחן%')
  })
})

describe('sanitizeOrTerm', () => {
  // A .or() string is an expression: a comma or paren in the term could add
  // filter conditions the caller never wrote.
  it('strips characters that are structural in a PostgREST or() filter', () => {
    expect(sanitizeOrTerm('a,b')).toBe('a b')
    expect(sanitizeOrTerm('x),status.neq.active')).toBe('x status.neq.active')
    expect(sanitizeOrTerm('a"b')).toBe('a b')
    expect(sanitizeOrTerm('a\\b')).toBe('a b')
  })

  it('strips pattern metacharacters too', () => {
    expect(sanitizeOrTerm('%')).toBe('')
    expect(sanitizeOrTerm('a_b')).toBe('a b')
    expect(sanitizeOrTerm('a*b')).toBe('a b')
  })

  it('collapses the whitespace left behind', () => {
    expect(sanitizeOrTerm('a,,,b')).toBe('a b')
  })

  it('caps the length', () => {
    expect(sanitizeOrTerm('x'.repeat(200))).toHaveLength(80)
    expect(sanitizeOrTerm('x'.repeat(200), 10)).toHaveLength(10)
  })

  it('leaves ordinary Hebrew text alone', () => {
    expect(sanitizeOrTerm('אוזניות בלוטות')).toBe('אוזניות בלוטות')
  })
})
