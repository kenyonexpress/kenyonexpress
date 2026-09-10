import {
  classifyCustomerTerm,
  phoneExactVariants,
  phoneLoosePattern,
} from '@/lib/admin/customer-search'
import { describe, expect, it } from 'vitest'

describe('classifyCustomerTerm', () => {
  it('reads an empty or whitespace term as empty', () => {
    expect(classifyCustomerTerm(null).kind).toBe('empty')
    expect(classifyCustomerTerm('').kind).toBe('empty')
    expect(classifyCustomerTerm('   ').kind).toBe('empty')
  })

  it('reads a uuid, lowercased, whatever case it arrived in', () => {
    const term = classifyCustomerTerm('3F2504E0-4F89-11D3-9A0C-0305E82C3301')
    expect(term.kind).toBe('uuid')
    expect(term.value).toBe('3f2504e0-4f89-11d3-9a0c-0305e82c3301')
    expect(term.fallbackToName).toBe(false)
  })

  it('reads anything containing @ as an email and never as a phone', () => {
    expect(classifyCustomerTerm('Dana@Example.COM')).toMatchObject({
      kind: 'email',
      value: 'dana@example.com',
    })
    // A "phone" with an @ in it is a typo'd email, not a number.
    expect(classifyCustomerTerm('050@example.com').kind).toBe('email')
  })

  it('reads the eight characters the confirmation email prints', () => {
    const term = classifyCustomerTerm('8F3A1C2B')
    expect(term.kind).toBe('order_ref')
    expect(term.value).toBe('8f3a1c2b')
  })

  it('lets an order ref fall back to a name search, because hex spells words', () => {
    // `deadbeef` is eight hex characters AND something a display name could
    // contain. The narrow read runs first; the caller widens on zero rows.
    expect(classifyCustomerTerm('deadbeef')).toMatchObject({
      kind: 'order_ref',
      fallbackToName: true,
    })
  })

  it('does not read seven or nine hex characters as an order ref', () => {
    expect(classifyCustomerTerm('8f3a1c2').kind).toBe('name')
    expect(classifyCustomerTerm('8f3a1c2bc').kind).toBe('name')
  })

  it.each([
    ['050-123-4567', '972501234567'],
    ['0501234567', '972501234567'],
    ['+972 50 123 4567', '972501234567'],
    ['972501234567', '972501234567'],
    ['(050) 123-4567', '972501234567'],
  ])('normalises %s to %s', (input, expected) => {
    const term = classifyCustomerTerm(input)
    expect(term.kind).toBe('phone')
    expect(term.value).toBe(expected)
  })

  it('does not turn a short numeric name fragment into somebody else s number', () => {
    // `normalizeIsraeliPhone` strips every non-digit and would happily accept a
    // 9-digit string; the shape guard is what stops "05" and "123" here.
    expect(classifyCustomerTerm('05').kind).toBe('name')
    expect(classifyCustomerTerm('123').kind).toBe('name')
  })

  it('reads Hebrew text as a name', () => {
    expect(classifyCustomerTerm('דנה כהן')).toMatchObject({ kind: 'name', value: 'דנה כהן' })
  })

  it('keeps the raw term alongside the narrowed value', () => {
    // The "no results for X" message has to be able to say X, and X is what the
    // operator typed and not what the classifier made of it.
    expect(classifyCustomerTerm('  050-123-4567  ').raw).toBe('050-123-4567')
  })
})

describe('phone query shapes', () => {
  it('offers the four spellings that are actually stored', () => {
    const variants = phoneExactVariants('972501234567')
    expect(variants).toEqual(['0501234567', '972501234567', '+972501234567', '501234567'])
  })

  it('builds a separator-blind pattern that matches every written form', () => {
    const pattern = phoneLoosePattern('972501234567')
    expect(pattern).toBe('%0%5%0%1%2%3%4%5%6%7%')

    // The property that matters: turn the pattern into a regex the way SQL
    // ILIKE would read it, and every human spelling of the number matches.
    const asRegex = new RegExp(`^${pattern.replace(/%/g, '.*')}$`)
    for (const written of [
      '0501234567',
      '050-123-4567',
      '050 123 4567',
      '(050) 123-4567',
      '050.123.4567',
    ]) {
      expect(asRegex.test(written)).toBe(true)
    }
    expect(asRegex.test('0521234567')).toBe(false)
  })
})
