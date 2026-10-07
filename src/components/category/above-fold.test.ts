import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ABOVE_FOLD_CARD_COUNT } from './above-fold'

/**
 * The server pages compare a card index against this number. If it ever
 * moves back into (or is re-exported from) a `'use client'` module, a server
 * importer receives a client-reference proxy instead of the value and every
 * comparison is false, with no error anywhere: that is exactly what the first
 * build of STEP 35 shipped. Pinned by reading the source, which is the only
 * place the directive is visible.
 */
describe('ABOVE_FOLD_CARD_COUNT', () => {
  const root = resolve(__dirname, '../../..')

  it('is a plain number', () => {
    expect(typeof ABOVE_FOLD_CARD_COUNT).toBe('number')
    expect(ABOVE_FOLD_CARD_COUNT).toBeGreaterThanOrEqual(2)
  })

  it('is defined in a module with no client directive', () => {
    const text = readFileSync(resolve(root, 'src/components/category/above-fold.ts'), 'utf8')
    expect(text).not.toMatch(/^\s*['"]use client['"]/m)
  })

  it('is not exported from the client card', () => {
    const card = readFileSync(
      resolve(root, 'src/components/category/CategoryProductCard.tsx'),
      'utf8',
    )
    expect(card).toMatch(/^\s*['"]use client['"]/m)
    expect(card).not.toMatch(/export\s+(const|function|let)\s+ABOVE_FOLD_CARD_COUNT/)
    expect(card).not.toMatch(/export\s*\{[^}]*ABOVE_FOLD_CARD_COUNT/)
  })

  it('is what every grid page imports', () => {
    const pages = [
      'src/app/(store)/category/[slug]/page.tsx',
      'src/app/(store)/products/page.tsx',
      'src/app/(store)/search/page.tsx',
      'src/app/(store)/s/[id]/page.tsx',
      'src/app/(store)/wishlist/shared/[token]/page.tsx',
    ]
    for (const page of pages) {
      const text = readFileSync(resolve(root, page), 'utf8')
      expect(text, page).toMatch(/from '@\/components\/category\/above-fold'/)
      expect(text, page).toMatch(/eager=\{index < ABOVE_FOLD_CARD_COUNT\}/)
    }
  })
})
