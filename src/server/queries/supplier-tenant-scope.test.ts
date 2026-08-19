import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Every supplier read is scoped to one supplier, checked at the source.
 *
 * WHY A SOURCE SCAN. This schema's tenant key is `supplier_id` -- there is no
 * `tenant_id` column in it -- and the portal has two locks on it:
 *
 *   1. RLS. `is_supplier_member(supplier_id)` on `order_items`, `vouchers`,
 *      `voucher_redemptions` and `products`
 *      (ARCHITECTURE-SUPPLIER-PORTAL.md section 3.2).
 *   2. The `.eq('supplier_id', ...)` in each function below.
 *
 * Lock 1 is not holding here. Every function in this module runs on
 * `createAdminClient()`, the service role, which bypasses RLS outright -- it
 * has to, because these reads join `orders` and `products`, which have no
 * supplier-facing SELECT policy of their own. That makes lock 2 the only thing
 * standing between one shop and another shop's revenue, and a lock with no
 * backup deserves a test that fails when someone removes it.
 *
 * A unit test cannot do this job: it would have to mock the Supabase builder,
 * and a mock that returns rows proves the mock filters, not that the query
 * does. Reading the source proves the filter was written.
 */

const MODULE = 'src/server/queries/supplier.ts'

function source(): string {
  return readFileSync(resolve(process.cwd(), MODULE), 'utf8')
}

/** Comments discuss supplier_id at length; only real code counts. */
function codeOnly(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !line.trim().startsWith('//') && !line.trim().startsWith('*'))
    .join('\n')
}

/**
 * Split the file at each exported query, so one function's filter cannot vouch
 * for the next one's. This was the failure mode worth designing against: a
 * whole-file grep for `supplier_id` passes as long as ANY function filters.
 */
function exportedQueries(code: string): Array<{ name: string; body: string }> {
  const starts: Array<{ name: string; at: number }> = []
  const pattern = /export async function (\w+)\s*\(/g
  let match = pattern.exec(code)
  while (match) {
    starts.push({ name: match[1] as string, at: match.index })
    match = pattern.exec(code)
  }

  return starts.map((start, index) => ({
    name: start.name,
    body: code.slice(start.at, starts[index + 1]?.at ?? code.length),
  }))
}

describe('supplier queries are scoped to one tenant', () => {
  const queries = exportedQueries(codeOnly(source()))

  it('finds the exported reads at all', () => {
    // A rename that empties this list would make every assertion below vacuous.
    expect(queries.map((q) => q.name)).toEqual(
      expect.arrayContaining([
        'getSupplierSales',
        'getSupplierOrders',
        'getSupplierRedemptions',
        'getSupplierProducts',
      ]),
    )
  })

  it.each(queries.map((q) => q.name))('%s takes the supplier id as its scope', (name) => {
    const query = queries.find((q) => q.name === name)
    // The id is a parameter, never derived inside the function: every call site
    // passes the one `requireSupplierMember` verified against an active
    // supplier_members row.
    expect(query?.body).toMatch(/\(\s*supplierId:\s*string/)
  })

  it.each(queries.map((q) => q.name))('%s filters the query by that id', (name) => {
    const query = queries.find((q) => q.name === name)
    expect(query?.body).toMatch(/\.eq\(\s*['"]supplier_id['"]\s*,\s*supplierId\s*\)/)
  })

  /**
   * `vouchers` is absent, and not by oversight: it has no `deleted_at` column.
   * A voucher is never soft-deleted -- it moves to a terminal `voucher_status`
   * (`cancelled`, `refunded`, `expired`) and the row stays, because it is the
   * audit record of money a customer paid. The tables listed here are the ones
   * that do carry the column.
   */
  const SOFT_DELETED = ['getSupplierSales', 'getSupplierOrders', 'getSupplierProducts']

  it.each(SOFT_DELETED)('%s excludes soft-deleted rows', (name) => {
    // The admin client bypasses the RLS predicate that would have done this.
    // A soft-deleted row is one an admin took off the money path, and showing
    // it again through the service role undoes that.
    const query = queries.find((q) => q.name === name)
    expect(query, `${name} is no longer an exported query in ${MODULE}`).toBeDefined()
    expect(query?.body).toMatch(/\.is\(\s*['"]deleted_at['"]\s*,\s*null\s*\)/)
  })
})
