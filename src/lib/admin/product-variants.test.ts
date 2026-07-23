import { describe, expect, it } from 'vitest'
import { variantIdsToRemove } from './product-variants'

const A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'

describe('variantIdsToRemove', () => {
  // The core of the bug: a variant present in the DB but dropped from the
  // submitted form must be marked for removal.
  it('flags an existing variant that was removed from the form', () => {
    expect(variantIdsToRemove([A, B], [A])).toEqual([B])
  })

  it('removes nothing when every existing variant is still submitted', () => {
    expect(variantIdsToRemove([A, B], [A, B])).toEqual([])
  })

  it('removes all existing variants when the form submits none', () => {
    expect(variantIdsToRemove([A, B], [])).toEqual([A, B])
  })

  it('ignores newly-added variants (undefined ids) when computing removals', () => {
    // Submitted set: kept A, plus a brand-new variant with no id.
    expect(variantIdsToRemove([A, B], [A, undefined])).toEqual([B])
  })

  it('returns empty for a product that had no variants', () => {
    expect(variantIdsToRemove([], [undefined, undefined])).toEqual([])
  })
})
