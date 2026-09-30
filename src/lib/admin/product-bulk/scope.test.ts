import { describe, expect, it } from 'vitest'
import { bulkScopeSchema, describeScope, isUnboundedScope, skuGlobToLike } from './scope'

describe('skuGlobToLike', () => {
  it('turns * and ? into LIKE wildcards', () => {
    expect(skuGlobToLike('AB-*')).toBe('AB-%')
    expect(skuGlobToLike('AB-1?0')).toBe('AB-1_0')
  })

  it('escapes the LIKE metacharacters the SKU itself contains', () => {
    expect(skuGlobToLike('AB_100%')).toBe('AB\\_100\\%')
    expect(skuGlobToLike('a\\b')).toBe('a\\\\b')
  })

  it('leaves a pattern without wildcards as an exact match', () => {
    expect(skuGlobToLike('  AB-100 ')).toBe('AB-100')
  })
})

describe('bulkScopeSchema', () => {
  it('normalises blanks to empty / null', () => {
    const parsed = bulkScopeSchema.parse({
      skuPattern: ' ',
      q: '',
      categoryId: '',
      status: '',
      type: '',
    })
    expect(parsed).toEqual({ skuPattern: '', q: '', categoryId: null, status: null, type: null })
    expect(isUnboundedScope(parsed)).toBe(true)
  })

  it('refuses an unknown status and a non-uuid category', () => {
    expect(bulkScopeSchema.safeParse({ status: 'live' }).success).toBe(false)
    expect(bulkScopeSchema.safeParse({ categoryId: 'shoes' }).success).toBe(false)
  })

  it('accepts a full scope', () => {
    const parsed = bulkScopeSchema.parse({
      skuPattern: 'AB-*',
      q: 'נעל',
      categoryId: '11111111-1111-4111-8111-111111111111',
      status: 'active',
      type: 'physical',
    })
    expect(parsed.status).toBe('active')
    expect(isUnboundedScope(parsed)).toBe(false)
  })
})

describe('describeScope', () => {
  it('names every filter in Hebrew, and the whole catalogue when empty', () => {
    expect(describeScope(bulkScopeSchema.parse({}))).toBe('כל המוצרים')
    const text = describeScope(
      bulkScopeSchema.parse({
        skuPattern: 'AB-*',
        q: 'נעל',
        categoryId: '11111111-1111-4111-8111-111111111111',
        status: 'draft',
        type: 'coupon',
      }),
      'הנעלה',
    )
    expect(text).toBe('מק"ט AB-* · שם מכיל "נעל" · קטגוריה הנעלה · טיוטה · קופון')
  })
})
