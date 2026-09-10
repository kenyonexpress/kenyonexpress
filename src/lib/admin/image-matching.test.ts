import { type MatchableProduct, imageKey, matchImagesToProducts } from '@/lib/admin/image-matching'
import { describe, expect, it } from 'vitest'

function product(over: Partial<MatchableProduct> & { id: string }): MatchableProduct {
  return { slug: over.id, sku: null, nameHe: null, ...over }
}

describe('imageKey', () => {
  it('is the basename, lowercased, without the extension', () => {
    expect(imageKey('IMG_2024 Shoe.JPG')).toBe('img_2024 shoe')
    expect(imageKey('/tmp/uploads/צימר-מאסטר.webp')).toBe('צימר-מאסטר')
  })

  it('strips nothing else', () => {
    // A trailing -1 could mean "second image of the same product" or could be
    // part of the slug. Guessing attaches files to products nobody asked for.
    expect(imageKey('shoe-1.png')).toBe('shoe-1')
  })
})

describe('matchImagesToProducts', () => {
  it('matches on SKU first, as the section asks', () => {
    const result = matchImagesToProducts(
      ['SKU-123.jpg'],
      [product({ id: 'p1', sku: 'sku-123', slug: 'something-else' })],
    )
    expect(result.matched).toEqual([
      { filename: 'SKU-123.jpg', productId: 'p1', matchedOn: 'sku', productNameHe: null },
    ])
  })

  it('falls back to the slug, which is the only key this catalogue has', () => {
    // Measured 2026-09-10: 1 of 80 products carries a SKU. A SKU-only matcher
    // would match one row in the entire live catalogue.
    const result = matchImagesToProducts(
      ['צימר-מאסטר.webp'],
      [product({ id: 'p1', slug: 'צימר-מאסטר', nameHe: 'צימר מאסטר' })],
    )
    expect(result.matched[0]).toMatchObject({ productId: 'p1', matchedOn: 'slug' })
  })

  it('prefers the SKU when a filename could be either', () => {
    const result = matchImagesToProducts(
      ['shared.jpg'],
      [
        product({ id: 'by-sku', sku: 'shared', slug: 'a' }),
        product({ id: 'by-slug', slug: 'shared' }),
      ],
    )
    expect(result.matched[0]).toMatchObject({ productId: 'by-sku', matchedOn: 'sku' })
  })

  it('reports a filename nothing answers to', () => {
    const result = matchImagesToProducts(['nobody.png'], [product({ id: 'p1', slug: 'a' })])
    expect(result.matched).toEqual([])
    expect(result.problems).toEqual([{ filename: 'nobody.png', reason: 'no_match' }])
  })

  it('REFUSES rather than picking when two products answer to one key', () => {
    // A draft and an active row can share a slug. Attaching an image to the
    // wrong product is silent and is found by a customer.
    const result = matchImagesToProducts(
      ['dup.png'],
      [product({ id: 'p1', slug: 'dup' }), product({ id: 'p2', slug: 'dup' })],
    )
    expect(result.matched).toEqual([])
    expect(result.problems[0]).toMatchObject({ reason: 'ambiguous_products' })
    expect(result.problems[0]?.productIds).toEqual(['p1', 'p2'])
  })

  it('REFUSES both files when two of them reduce to one key', () => {
    const result = matchImagesToProducts(
      ['shoe.jpg', 'shoe.png'],
      [product({ id: 'p1', slug: 'shoe' })],
    )
    expect(result.matched).toEqual([])
    expect(result.problems.map((p) => p.reason)).toEqual(['ambiguous_files', 'ambiguous_files'])
  })

  it('does not let listing order decide an ambiguous pair', () => {
    const forward = matchImagesToProducts(['a.jpg', 'a.png'], [product({ id: 'p1', slug: 'a' })])
    const reverse = matchImagesToProducts(['a.png', 'a.jpg'], [product({ id: 'p1', slug: 'a' })])
    expect(forward.matched).toEqual(reverse.matched)
    expect(forward.matched).toEqual([])
  })

  it('ignores an empty or whitespace SKU rather than matching on it', () => {
    const result = matchImagesToProducts(['x.jpg'], [product({ id: 'p1', sku: '   ', slug: 'x' })])
    expect(result.matched[0]).toMatchObject({ matchedOn: 'slug' })
  })

  it('handles a mixed batch without letting one bad file stop the rest', () => {
    const result = matchImagesToProducts(
      ['good.jpg', 'nobody.jpg'],
      [product({ id: 'p1', slug: 'good' })],
    )
    expect(result.matched).toHaveLength(1)
    expect(result.problems).toHaveLength(1)
  })
})
