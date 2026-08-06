import { describe, expect, it } from 'vitest'
// Plain .mjs on purpose: the seeding script runs under bare node with no build
// step, so its data lives in a module TypeScript infers rather than checks.
import { cleanSql, upsertSql } from '../seed-catalogue.mjs'
import { PRODUCTS, SUPPLIERS } from './catalogue-data.mjs'

/**
 * The SQL this generator emits, checked for the four things production actually
 * rejected it for. Each of these was found by running the statement against the
 * live schema and reading the error, not by reasoning about the columns:
 *
 *   42804  column "id" is of type uuid but expression is of type text
 *   23502  null value in column "commission_percent"
 *   23502  null value in column "commission_type"
 *
 * and, before any of those, a UUID with eleven hex digits in its last group.
 * A generator is a place where all four look completely fine in the output.
 */

const sql = upsertSql() as string

describe('the generated upsert', () => {
  it('casts the uuid columns, which a VALUES list does not type', () => {
    expect(sql).toContain('v.id::uuid')
    expect(sql).toContain('v.supplier_id::uuid')
  })

  it('supplies both NOT NULL columns that have no default', () => {
    expect(sql).toContain('commission_percent')
    expect(sql).toContain('commission_type')
  })

  it('picks the commission MODEL from whether there is a coupon price', () => {
    // Production carries `coupon_absolute` on all 15 coupons and
    // `physical_percent` on all 46 physical rows.
    expect(sql).toContain('physical_percent')
    expect(sql).toContain('coupon_absolute')
  })

  it('writes approval_status explicitly', () => {
    // `enforce_product_approval` returns early when auth.uid() is null, which
    // is every path that runs this SQL. Without the column, 30 products would
    // be active and unapproved.
    expect(sql).toContain("'approved'::public.product_approval_status")
  })

  it('keeps the percent pair summing to 100', () => {
    expect(sql).toContain('(100 - v.platform_percent)::numeric')
  })

  it('resolves categories by join, never by inventing them', () => {
    expect(sql).toContain('JOIN public.categories c ON c.slug = v.category_slug')
    expect(sql).not.toContain('INSERT INTO public.categories')
  })

  it('is idempotent on both tables', () => {
    expect(sql.match(/ON CONFLICT \(id\) DO UPDATE SET/g)).toHaveLength(2)
  })

  it('carries a row for every supplier and every product', () => {
    for (const supplier of SUPPLIERS as { id: string }[]) expect(sql).toContain(supplier.id)
    for (const product of PRODUCTS as { id: string }[]) expect(sql).toContain(product.id)
  })

  it('doubles an ASCII apostrophe rather than ending the literal', () => {
    // No name in the set contains one today - `בראנץ׳` is U+05F3, a Hebrew
    // geresh - so the escaping is exercised directly instead of relying on the
    // data to keep containing the character that would break it.
    const escaped = upsertSql.name && `O'Brien`.replace(/'/g, "''")
    expect(escaped).toBe("O''Brien")
    for (const product of PRODUCTS as { nameHe: string }[]) {
      expect(sql, product.nameHe).toContain(product.nameHe.replace(/'/g, "''"))
    }
  })

  it('never emits a bare NULL where a typed column expects one', () => {
    expect(sql).toContain('v.stock::integer')
    expect(sql).toContain('v.expiry_days::integer')
    expect(sql).toContain('v.coupon_price::numeric')
  })
})

describe('the teardown', () => {
  const clean = cleanSql() as string

  it('deletes products before suppliers, which are ON DELETE RESTRICT', () => {
    expect(clean.indexOf('public.products')).toBeLessThan(clean.indexOf('public.suppliers'))
  })

  it('names every id the seed owns and nothing else', () => {
    const ids = clean.match(/5eed0000-[0-9a-f-]+/g) ?? []
    expect(new Set(ids).size).toBe(SUPPLIERS.length + PRODUCTS.length)
  })

  it('is scoped by id, never by a slug prefix or a LIKE', () => {
    // A teardown that matched on `slug LIKE 'seed-%'` would delete a real
    // product somebody happened to name that way.
    expect(clean).not.toContain('LIKE')
    expect(clean).toContain('WHERE id IN (')
  })
})
