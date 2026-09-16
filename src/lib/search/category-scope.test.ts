import { describe, expect, it } from 'vitest'
import { parseCategoryScope } from './category-scope'

describe('parseCategoryScope', () => {
  it('accepts a slug as the catalogue spells them', () => {
    expect(parseCategoryScope('hot-deals')).toBe('hot-deals')
    expect(parseCategoryScope(' spa ')).toBe('spa')
    expect(parseCategoryScope('under-99')).toBe('under-99')
  })

  it('drops anything that is not a slug rather than failing the request', () => {
    expect(parseCategoryScope(null)).toBeUndefined()
    expect(parseCategoryScope(undefined)).toBeUndefined()
    expect(parseCategoryScope('')).toBeUndefined()
    expect(parseCategoryScope('Spa')).toBeUndefined()
    expect(parseCategoryScope('ספא')).toBeUndefined()
    expect(parseCategoryScope('spa" OR 1=1')).toBeUndefined()
    expect(parseCategoryScope('a'.repeat(65))).toBeUndefined()
  })
})
