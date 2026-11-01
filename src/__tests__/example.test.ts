import { cn, formatPrice } from '@/lib/utils'
import { describe, expect, it } from 'vitest'

describe('utils', () => {
  it('cn merges class names', () => {
    expect(cn('foo', 'bar')).toBe('foo bar')
    expect(cn('px-4', 'px-2')).toBe('px-2')
  })

  it('formatPrice formats ILS amounts as whole shekels', () => {
    const result = formatPrice(99.9)
    expect(result).toContain('100')
    expect(result).not.toMatch(/\d[.,]\d{2}(?!\d)/)
    expect(formatPrice(99.4)).toContain('99')
    expect(formatPrice(99.4)).not.toContain('99.4')
  })
})
