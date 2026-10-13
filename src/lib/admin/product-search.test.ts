import { describe, expect, it } from 'vitest'
import { adminProductSearchFilter } from './product-search'

describe('adminProductSearchFilter', () => {
  it('matches the name, the SKU and the slug', () => {
    expect(adminProductSearchFilter('KE-1042')).toBe(
      'name_he.ilike.%KE-1042%,sku.ilike.%KE-1042%,slug.ilike.%KE-1042%',
    )
  })

  it('keeps a Hebrew term intact', () => {
    expect(adminProductSearchFilter('ספא זוגי')).toContain('name_he.ilike.%ספא זוגי%')
  })

  it('adds no filter for an empty or punctuation-only term', () => {
    expect(adminProductSearchFilter(undefined)).toBeNull()
    expect(adminProductSearchFilter('   ')).toBeNull()
    expect(adminProductSearchFilter('%_,()')).toBeNull()
  })

  it('cannot be used to append a condition', () => {
    const filter = adminProductSearchFilter('x,status.eq.draft)') ?? ''
    // Three conditions, one per column, and nothing the term brought with it.
    expect(filter.split(',')).toHaveLength(3)
    expect(filter).not.toContain(')')
    expect(filter).not.toContain('status.eq.draft,')
  })
})
