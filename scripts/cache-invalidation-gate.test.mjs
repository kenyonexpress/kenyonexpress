import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  DELIBERATE_EXCEPTIONS,
  UNTAGGED_ON_PURPOSE,
  cachedTables,
  classifyAction,
  scanCacheInvalidation,
  untaggedCachedScopes,
} from './cache-invalidation-scan.mjs'

/**
 * THE GATE FOR A CONTRACT THAT WAS WRITTEN DOWN AND NOT ENFORCED.
 *
 * `src/lib/catalogue-cache.ts` says, in capitals: "EVERY WRITE PATH THAT
 * CHANGES WHAT A SHOPPER SEES MUST CALL updateTag(CATALOGUE_TAG). A product
 * saved without it stays invisible on the storefront for up to an hour, the
 * admin sees their own change in the panel (which is uncached), and nothing
 * anywhere reports a problem."
 *
 * That is correct, it is complete, and nothing checked it.
 *
 * MEASURED 2026-09-09: `admin/suppliers.ts` updates `suppliers` on edit, on
 * status change and on soft delete, and called no `updateTag`. It called
 * `revalidatePath('/admin/suppliers')`, which refreshes the admin list -- the
 * one surface where the operator could already see their change -- and touches
 * nothing a shopper reads. So the omission looked like it had worked.
 *
 * The consequence was not cosmetic. `supplier-storefront.ts` reads that table
 * inside `use cache` and selects `status` and `deleted_at` so it can return
 * null for a supplier that is inactive or removed, and that filter runs when
 * the entry is BUILT. Deactivating or soft-deleting a supplier left its public
 * page serving, with its address and phone on it, for up to an hour.
 *
 * WHY THE TABLE LIST IS NOT WRITTEN IN THIS FILE. It is read out of the cached
 * source. A hand-kept list drifts the day somebody caches a new table, and the
 * drifted-away table is exactly the one nobody remembers to invalidate -- the
 * same failure one level up.
 */

describe('which tables the storefront caches', () => {
  it('reads them out of the source rather than a hand-kept list', () => {
    const tables = cachedTables()
    // The ones that existed on 2026-09-09. Asserted as a subset, not an
    // equality: caching a new table must not fail this test, it must widen the
    // gate.
    for (const table of ['products', 'categories', 'suppliers', 'coupon_deals', 'reviews']) {
      expect(tables.has(table)).toBe(true)
    }
  })

  it('does not collect a table nothing caches', () => {
    const tables = cachedTables()
    // Orders and payments are never rendered from a cached scope; if they ever
    // are, that is a much bigger conversation than this gate.
    expect(tables.has('payment_events')).toBe(false)
  })
})

describe('what counts as a write that must invalidate', () => {
  const tables = new Set(['suppliers', 'products'])

  it('REGRESSION_SUPPLIERS: an update with no updateTag is a violation', () => {
    const source = `
      const { error } = await admin.from('suppliers').update(parsed.data).eq('id', id)
      revalidatePath('/admin/suppliers')
    `
    const verdict = classifyAction(source, tables)
    expect(verdict.ok).toBe(false)
    expect(verdict.written).toEqual(['suppliers'])
  })

  it('REVALIDATE_PATH_IS_NOT_ENOUGH: an admin path refresh does not count', () => {
    // The trap that made the original bug invisible. revalidatePath on an
    // admin route refreshes the surface the operator could already see.
    const source = `await admin.from('suppliers').update(x).eq('id', id); revalidatePath('/admin/suppliers')`
    expect(classifyAction(source, tables).ok).toBe(false)
  })

  it('accepts updateTag, and accepts revalidateTag for a route handler', () => {
    const withUpdate = `await admin.from('suppliers').update(x); updateTag(CATALOGUE_TAG)`
    const withRevalidate = `await admin.from('products').update(x); revalidateTag(CATALOGUE_TAG)`
    expect(classifyAction(withUpdate, tables).ok).toBe(true)
    expect(classifyAction(withRevalidate, tables).ok).toBe(true)
  })

  it('sees the write through chained filters, which is how they are all written', () => {
    const source = `
      await admin.from('suppliers')
        .update({ deleted_at: new Date().toISOString(), status: 'inactive' })
        .eq('id', id)
    `
    expect(classifyAction(source, tables).written).toEqual(['suppliers'])
  })

  it('ignores a file that only reads a cached table', () => {
    const source = `const { data } = await admin.from('suppliers').select('id').eq('id', id)`
    const verdict = classifyAction(source, tables)
    expect(verdict.ok).toBe(true)
    expect(verdict.reason).toBe('writes-nothing-cached')
  })

  it('ignores a write to a table nothing caches', () => {
    const source = `await admin.from('payment_events').insert(row)`
    expect(classifyAction(source, tables).reason).toBe('writes-nothing-cached')
  })
})

describe('the exception list', () => {
  it('carries an argument for every entry, not just a path', () => {
    // A bare path is a suppression nobody has to justify. The argument is the
    // review step, and it has to survive being read a year later.
    for (const [file, reason] of DELIBERATE_EXCEPTIONS) {
      expect(file.startsWith('src/')).toBe(true)
      expect(reason.length).toBeGreaterThan(80)
    }
  })

  it('stays short enough that each one is still read', () => {
    expect(DELIBERATE_EXCEPTIONS.size).toBeLessThanOrEqual(3)
  })
})

/**
 * WIDENED 2026-09-10, and the reason is a file that was never looked at.
 *
 * The scan read `src/server/actions` alone and reported clean. The one writer
 * outside that tree is `src/app/api/cron/price-schedule/route.ts`, which UPDATEs
 * `products.kenyon_price` on a schedule - a price change with no operator
 * watching - and it invalidates correctly. Nothing was checking that it did.
 */
describe('where a write can come from', () => {
  const tables = cachedTables()

  it('accepts revalidateTag with a profile argument, which is what a route handler passes', () => {
    // `revalidateTag(CATALOGUE_TAG, 'hours')` is the correct call outside a
    // Server Action. The first pattern demanded a closing paren right after the
    // tag, so widening the roots would have failed a correct file.
    const source = `await admin.from('products').update({ kenyon_price: 1 }).eq('id', id)
      revalidateTag(CATALOGUE_TAG, 'hours')`
    expect(classifyAction(source, tables).ok).toBe(true)
  })

  it('looks at the cron route that changes prices on a schedule', () => {
    const source = readFileSync('src/app/api/cron/price-schedule/route.ts', 'utf8')
    const verdict = classifyAction(source, tables)
    expect(verdict.written).toContain('products')
    expect(verdict.ok, 'the scheduled price change no longer flushes the catalogue').toBe(true)
  })
})

describe('every cached scope carries a tag', () => {
  it('has no untagged scope in the repository', () => {
    expect(untaggedCachedScopes()).toEqual([])
  })

  it('reports a scope whose cacheTag is missing', () => {
    // The accident this catches: a cached reader copied from a neighbour, minus
    // one line. It expires on a timer and no write can flush it.
    const offenders = untaggedCachedScopes(['scripts/__fixtures__/untagged-cache'])
    expect(offenders).toHaveLength(1)
  })

  it('carries an argument for every scope exempted from the tag rule', () => {
    for (const [file, reason] of UNTAGGED_ON_PURPOSE) {
      expect(file.startsWith('src/')).toBe(true)
      expect(reason.length).toBeGreaterThan(80)
    }
  })
})

describe('the repository as it stands', () => {
  it('has no write path leaving the storefront cache stale', () => {
    expect(scanCacheInvalidation()).toEqual([])
  })
})
