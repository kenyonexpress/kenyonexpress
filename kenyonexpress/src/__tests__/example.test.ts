import { cn, formatPrice } from '@/lib/utils'
import { describe, expect, it } from 'vitest'

describe('utils', () => {
  it('cn merges class names', () => {
    expect(cn('foo', 'bar')).toBe('foo bar')
    expect(cn('px-4', 'px-2')).toBe('px-2')
  })

  it('formatPrice formats ILS amounts', () => {
    const result = formatPrice(99.9)
    expect(result).toContain('99')
  })
})
