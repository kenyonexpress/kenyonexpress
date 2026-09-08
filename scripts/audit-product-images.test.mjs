import { describe, expect, it } from 'vitest'
import { imagelessActiveProducts } from './audit-product-images.mjs'

/**
 * The blind spot, stated as a test.
 *
 * `collect()` walks `p.images`, so a product with an empty array contributes no
 * references. Every reference that does exist then resolves, and the run prints
 * "all resolve" - a pass earned by having nothing to look at, inside the one
 * audit whose subject is missing product imagery.
 *
 * Measured against production 2026-09-09: 45 active and approved products, one
 * of them published with `images: []`, and this audit had been green.
 */
describe('imagelessActiveProducts', () => {
  it('finds an active product with an empty array', () => {
    expect(imagelessActiveProducts([{ slug: 'whisky', status: 'active', images: [] }])).toEqual([
      'whisky',
    ])
  })

  it('finds one whose images are missing entirely, not just empty', () => {
    expect(imagelessActiveProducts([{ slug: 'a', status: 'active' }])).toEqual(['a'])
    expect(imagelessActiveProducts([{ slug: 'b', status: 'active', images: null }])).toEqual(['b'])
  })

  // Not a defect: a draft is not on sale, and 34 of this catalogue's 35 drafts
  // carry placeholder imagery on purpose.
  it('ignores drafts', () => {
    expect(imagelessActiveProducts([{ slug: 'draft', status: 'draft', images: [] }])).toEqual([])
  })

  it('ignores an active product that has an image', () => {
    expect(
      imagelessActiveProducts([{ slug: 'ok', status: 'active', images: ['/a.webp'] }]),
    ).toEqual([])
  })

  // The status column may not be selected by an older caller. Treating an
  // absent status as active is the safe direction: it over-reports rather than
  // going quiet, and going quiet is the failure being fixed.
  it('treats an unknown status as active', () => {
    expect(imagelessActiveProducts([{ slug: 'unknown', images: [] }])).toEqual(['unknown'])
  })

  it('sorts, so two runs of the same catalogue read the same', () => {
    const rows = [
      { slug: 'zeta', status: 'active', images: [] },
      { slug: 'alpha', status: 'active', images: [] },
    ]
    expect(imagelessActiveProducts(rows)).toEqual(['alpha', 'zeta'])
  })

  it('says nothing for an empty catalogue rather than inventing a finding', () => {
    expect(imagelessActiveProducts([])).toEqual([])
  })
})
