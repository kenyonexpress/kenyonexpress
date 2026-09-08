import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * A CACHED CATALOGUE OUTLIVES THE WRITE THAT SHOULD HAVE CHANGED IT.
 *
 * `lib/catalogue-cache.ts` states the contract in full: every write path that
 * changes what a shopper sees must call `updateTag(CATALOGUE_TAG)`, because a
 * product saved without it stays stale on the storefront for up to an hour
 * while the admin panel - which is uncached - shows the change immediately.
 * "That failure is silent, it is slow, and it looks like a database issue
 * rather than a caching one."
 *
 * It listed the paths that comply: admin/products, admin/categories,
 * admin/approvals. It named one deliberate exception, the stock decrement in
 * finalize.ts, with an argument. **Supplier writes were in neither list.**
 *
 * Measured 2026-09-08: `admin/suppliers.ts` writes four ways (edit, create,
 * status, soft delete) and `supplier/profile.ts` writes one - a business
 * editing its own name, address and phone - and none of the five invalidated.
 * Supplier fields render inside the product page's supplier block, which is one
 * of the reads carrying the tag. So a business that corrected its address saw
 * it in its own form at once and on its product pages up to an hour later,
 * which reads exactly like the save having failed.
 *
 * This is the counter, so the next write path is a decision rather than an
 * omission.
 */
const ROOT = resolve(__dirname, '..', '..')
const ACTIONS = join(ROOT, 'src/server/actions')

const CATALOGUE_TABLES = ['products', 'categories', 'suppliers', 'coupon_deals', 'product_variants']
const WRITE_CALLS = /\.(update|insert|upsert|delete)\(/

/**
 * Files that touch a catalogue table and legitimately do not invalidate. Each
 * needs a reason about what it WRITES, not about it being inconvenient.
 */
const NO_INVALIDATION_NEEDED: Record<string, string> = {
  'cart.ts':
    'reads products and variants for live pricing and stock; every write it makes is to carts',
  'payments/checkout.ts':
    'reads products for the settlement snapshot and suppliers for the identity copied onto the order; every write it makes is to orders, order_items, payments and addresses',
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) {
      walk(full, out)
      continue
    }
    if (full.endsWith('.ts') && !full.endsWith('.test.ts')) out.push(full)
  }
  return out
}

const suspects = walk(ACTIONS)
  .map((path) => ({ path: relative(ACTIONS, path), text: readFileSync(path, 'utf8') }))
  .filter((f) => CATALOGUE_TABLES.some((t) => f.text.includes(`.from('${t}')`)))
  .filter((f) => WRITE_CALLS.test(f.text))

describe('every server action near the catalogue either invalidates or says why not', () => {
  it('finds the files to judge at all, so a rename cannot empty this suite', () => {
    expect(suspects.length).toBeGreaterThanOrEqual(6)
  })

  for (const file of suspects) {
    it(`${file.path} invalidates, or is a named exception`, () => {
      const invalidates = file.text.includes('updateTag(')
      const excused = file.path in NO_INVALIDATION_NEEDED
      expect(
        invalidates || excused,
        `src/server/actions/${file.path} touches a catalogue table and writes, but never calls updateTag(CATALOGUE_TAG). A shopper would see the old value for up to an hour. Add the call, or list it in NO_INVALIDATION_NEEDED with what it actually writes.`,
      ).toBe(true)
    })
  }
})

describe('the supplier paths specifically', () => {
  // The five that were missing, pinned by name so a refactor cannot quietly
  // drop them back into the gap.
  const supplierAdmin = readFileSync(join(ACTIONS, 'admin/suppliers.ts'), 'utf8')
  const supplierSelf = readFileSync(join(ACTIONS, 'supplier/profile.ts'), 'utf8')

  it('the admin path invalidates on each of its four writes', () => {
    expect(supplierAdmin.match(/updateTag\(CATALOGUE_TAG\)/g) ?? []).toHaveLength(4)
  })

  it('a supplier editing its own profile invalidates too', () => {
    expect(supplierSelf).toContain('updateTag(CATALOGUE_TAG)')
  })
})

describe('the exception list stays honest', () => {
  it('excuses only files that exist and are actually suspects', () => {
    const paths = new Set(suspects.map((f) => f.path))
    for (const name of Object.keys(NO_INVALIDATION_NEEDED)) {
      expect(paths.has(name), `${name} is excused but is not a suspect`).toBe(true)
    }
  })

  it('does not excuse a file that already invalidates', () => {
    for (const name of Object.keys(NO_INVALIDATION_NEEDED)) {
      const file = suspects.find((f) => f.path === name)
      expect(file?.text.includes('updateTag('), `${name} is excused AND invalidates`).toBe(false)
    }
  })
})
