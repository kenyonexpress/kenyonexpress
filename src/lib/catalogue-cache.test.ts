import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { CATALOGUE_TAG } from './catalogue-cache'

/**
 * The storefront catalogue is cached for an hour. These tests read the SOURCE of
 * the write paths, because the failure they guard against does not throw, does
 * not log, and does not show up in the admin.
 *
 * An admin saves a product. The panel is uncached, so they see their change
 * immediately and believe it worked. The storefront keeps serving the previous
 * catalogue for up to an hour. Nothing anywhere reports a problem, and the
 * report that eventually arrives is "the site is not updating", which looks
 * like a database fault rather than a missing line in a server action.
 *
 * Reading the call site is the only way to assert this without a live admin
 * session and a real product: the tag is invisible in the function's return
 * value and in its effect on the database, and it is exactly what a future
 * refactor of these actions would drop without noticing.
 */
const WRITE_PATHS = [
  'src/server/actions/admin/products.ts',
  'src/server/actions/admin/categories.ts',
  'src/server/actions/admin/approvals.ts',
] as const

const read = (p: string) => readFileSync(p, 'utf8')

/**
 * Source with comments removed.
 *
 * Counting occurrences in raw source counts the prose too: the header of
 * category-page.ts explains `cacheLife('hours')` in words, which made the first
 * version of the count-matching test below fail at 8 against 7 real scopes.
 * That is a test reporting on its own regex rather than on the code.
 */
const code = (p: string) =>
  read(p)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')

describe('catalogue cache invalidation', () => {
  it.each(WRITE_PATHS)('%s invalidates the storefront catalogue', (path) => {
    const src = read(path)
    expect(src, `${path} does not import CATALOGUE_TAG`).toContain('CATALOGUE_TAG')
    expect(src, `${path} never calls updateTag`).toContain('updateTag(CATALOGUE_TAG)')
  })

  /**
   * Every admin revalidatePath in these files marks a successful write, so each
   * one is also a point where the storefront went stale. Counting them against
   * the updateTag calls is what catches a NEW action being added later with the
   * admin revalidation copied and the storefront one forgotten.
   *
   * products.ts revalidates one path per write; categories.ts and approvals.ts
   * revalidate more than one path per write (the list and the detail screen),
   * so the comparison is per file and uses the count of writes, not of paths.
   */
  it('has one storefront invalidation per admin write, in products.ts', () => {
    const src = code('src/server/actions/admin/products.ts')
    const adminRevalidations = src.match(/revalidatePath\('\/admin\/products'\)/g) ?? []
    const storefrontInvalidations = src.match(/updateTag\(CATALOGUE_TAG\)/g) ?? []
    expect(storefrontInvalidations.length, 'a write revalidates admin but not the shop').toBe(
      adminRevalidations.length,
    )
  })

  it('uses updateTag, not revalidateTag, so an admin can see their own save', () => {
    for (const path of WRITE_PATHS) {
      expect(read(path), `${path} uses revalidateTag`).not.toContain('revalidateTag(CATALOGUE_TAG)')
    }
  })

  /**
   * The reads have to actually be tagged, or the writes above invalidate
   * nothing. Both halves of the contract fail silently on their own.
   */
  it('tags every cached catalogue read', () => {
    for (const file of ['src/lib/category-page.ts', 'src/lib/product-seo.ts']) {
      const src = code(file)
      const cachedScopes = src.match(/'use cache'/g) ?? []
      const tagged = src.match(/cacheTag\(CATALOGUE_TAG\)/g) ?? []
      const lifed = src.match(/cacheLife\('hours'\)/g) ?? []

      expect(cachedScopes.length, `${file}: no cached reads`).toBeGreaterThan(0)
      expect(tagged.length, `${file}: a use cache read carries no cacheTag`).toBe(
        cachedScopes.length,
      )
      expect(lifed.length, `${file}: a use cache read carries no cacheLife`).toBe(
        cachedScopes.length,
      )
    }
  })

  /**
   * A cached scope cannot read cookies, so a catalogue read that went back to
   * the request-scoped client would fail the BUILD - but only if it is also
   * inside a `use cache`. One that is neither compiles, runs, and quietly
   * returns a different catalogue per visitor while costing a round trip on
   * every page view, which is the state this replaced.
   */
  it('reads the catalogue with the anon client and never the cookie-bound one', () => {
    for (const file of ['src/lib/category-page.ts', 'src/lib/product-seo.ts']) {
      expect(code(file)).toContain('createPublicClient')
      expect(code(file), `${file} calls createClient()`).not.toMatch(/await createClient\(\)/)
    }
  })

  it('exposes a tag string that is a valid cache tag', () => {
    expect(CATALOGUE_TAG).toBeTruthy()
    expect(CATALOGUE_TAG.length).toBeLessThanOrEqual(256)
  })
})
