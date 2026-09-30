import { describe, expect, it } from 'vitest'
import { matchR2KeysToSkus, normaliseSkuStem } from './r2-images'

describe('normaliseSkuStem', () => {
  it('lower-cases and unifies separators', () => {
    expect(normaliseSkuStem(' AB_100 ')).toBe('ab-100')
    expect(normaliseSkuStem('ab 100')).toBe('ab-100')
    expect(normaliseSkuStem('AB-100')).toBe('ab-100')
  })
})

describe('matchR2KeysToSkus', () => {
  const keys = [
    'catalog/2026/AB-100.jpg',
    'catalog/2026/AB-100-2.webp',
    'catalog/2026/ab_100_1.png',
    'catalog/2026/AB-1000.jpg',
    'catalog/2026/AB-100-front.jpg',
    'catalog/2026/AB-100.txt',
    'catalog/2026/CD-7-1.jpeg',
    'catalog/2026/readme',
    'other/EF-9.avif',
  ]

  it('groups image keys by sku, main image first then by gallery number', () => {
    const out = matchR2KeysToSkus(keys, ['AB-100', 'cd-7', 'EF-9', 'GH-0'])
    expect(out.get('ab-100')).toEqual([
      'catalog/2026/AB-100.jpg',
      'catalog/2026/ab_100_1.png',
      'catalog/2026/AB-100-2.webp',
    ])
    expect(out.get('cd-7')).toEqual(['catalog/2026/CD-7-1.jpeg'])
    expect(out.get('ef-9')).toEqual(['other/EF-9.avif'])
    expect(out.has('gh-0')).toBe(false)
  })

  it('does not match a longer sku, a word suffix, or a non-image file', () => {
    const out = matchR2KeysToSkus(keys, ['AB-100'])
    const matched = out.get('ab-100') ?? []
    expect(matched).not.toContain('catalog/2026/AB-1000.jpg')
    expect(matched).not.toContain('catalog/2026/AB-100-front.jpg')
    expect(matched).not.toContain('catalog/2026/AB-100.txt')
  })

  it('ignores blank skus and gives separator-twins the same files', () => {
    const out = matchR2KeysToSkus(['x/AB-100.jpg'], ['', '  ', 'AB-100', 'ab_100'])
    expect(out.get('ab-100')).toEqual(['x/AB-100.jpg'])
    expect(out.get('ab_100')).toEqual(['x/AB-100.jpg'])
    expect(out.size).toBe(2)
  })
})
