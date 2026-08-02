import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { CATALOGUE_TAG } from './catalogue-cache'

/**
 * Storefront catalogue pages use ISR (`export const revalidate`). Admin writes
 * must call `revalidateStorefrontCatalogue` or shoppers keep a stale page for
 * the full revalidate window. These tests read the SOURCE of the write paths.
 */
const WRITE_PATHS = [
  'src/server/actions/admin/products.ts',
  'src/server/actions/admin/categories.ts',
  'src/server/actions/admin/approvals.ts',
] as const

const read = (p: string) => readFileSync(p, 'utf8')

const code = (p: string) =>
  read(p)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')

describe('catalogue cache invalidation', () => {
  it.each(WRITE_PATHS)('%s invalidates the storefront catalogue', (path) => {
    const src = read(path)
    expect(src, `${path} does not import revalidateStorefrontCatalogue`).toContain(
      'revalidateStorefrontCatalogue',
    )
    expect(src, `${path} never calls revalidateStorefrontCatalogue`).toContain(
      'revalidateStorefrontCatalogue(',
    )
  })

  it('has one storefront invalidation per admin write, in products.ts', () => {
    const src = code('src/server/actions/admin/products.ts')
    const adminRevalidations = src.match(/revalidatePath\('\/admin\/products'\)/g) ?? []
    const storefrontInvalidations = src.match(/revalidateStorefrontCatalogue\(/g) ?? []
    expect(storefrontInvalidations.length, 'a write revalidates admin but not the shop').toBe(
      adminRevalidations.length,
    )
  })

  it('exposes a tag string that is a valid cache tag', () => {
    expect(CATALOGUE_TAG).toBeTruthy()
    expect(CATALOGUE_TAG.length).toBeLessThanOrEqual(256)
  })
})
