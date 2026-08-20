import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * A supplier sees their own supplier_id and no other. Two halves, because the
 * platform enforces it in two different places and only one of them is RLS.
 *
 * ── HALF ONE: RLS, MEASURED IN PRODUCTION ───────────────────────────────────
 *
 * Probed on 2026-08-20 through MCP inside a transaction that was rolled back by
 * raising at the end, so nothing was left behind. A membership was inserted for
 * a plain `customer` profile that owns no orders -- the first attempt used the
 * oldest auth user, who turned out to own all four orders, and `is_admin()` or
 * `orders.user_id = auth.uid()` would have carried the reads on their own and
 * proved nothing. Then `SET LOCAL ROLE authenticated` with that user's sub in
 * `request.jwt.claims`:
 *
 *   order_items      2 visible, all 2 the member's own supplier,
 *                    0 of the other supplier's 1 row
 *   orders           2 of 4
 *   supplier_members 1, their own
 *   suppliers        11 of 11   <- the exception, below
 *
 * The policies behind that, read from pg_policy the same day:
 *
 *   order_items_select_unified  ... is_supplier_member(supplier_id) ...
 *   orders_select_unified       ... is_supplier_order(id) ...
 *   vouchers_select_unified     ... is_supplier_member(redeemed_by_supplier_id)
 *
 * `suppliers` is public on purpose at the row level -- one policy, TO public,
 * `deleted_at IS NULL` -- because it is the business directory. The columns are
 * a separate question and migration 124 answers it.
 *
 * ── HALF TWO: THE SERVICE-ROLE PATH, WHICH IS WHAT THIS FILE TESTS ──────────
 *
 * RLS is not what protects the supplier dashboard. `src/server/queries/supplier.ts`
 * runs every one of its reads through `createAdminClient()`, which connects as
 * `service_role` and is EXEMPT from row-level security: not "allowed by the
 * policy", not evaluated against it at all. The only thing standing between a
 * supplier and another supplier's sales there is the `.eq('supplier_id', ...)`
 * in the query text. A measurement of the policies cannot see that, and a unit
 * test with a mocked client only proves the mock was called the way the test
 * expected. So the query text is what is pinned.
 *
 * This is the same shape as `no-escrow-in-supplier-due.test.ts` next door, and
 * for the same reason: the bug it guards against is a new function, added later,
 * that forgets one line.
 */

const SUPPLIER_QUERIES = 'src/server/queries/supplier.ts'

function source(relative: string): string {
  return readFileSync(resolve(process.cwd(), relative), 'utf8')
}

/** Comments in these files quote the very filters being searched for. */
function codeOnly(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !line.trim().startsWith('//') && !line.trim().startsWith('*'))
    .join('\n')
}

type ExportedFn = { name: string; signature: string; body: string }

/**
 * Split the file at each exported function and keep the text up to the next
 * one. Crude on purpose: a real parse would need a TypeScript program for a
 * question that is answered by "is the filter in these lines".
 */
function exportedFunctions(code: string): ExportedFn[] {
  const starts: { name: string; index: number }[] = []
  const pattern = /export\s+(?:async\s+)?function\s+(\w+)/g
  for (const match of code.matchAll(pattern)) {
    starts.push({ name: match[1] as string, index: match.index })
  }
  return starts.map((start, i) => {
    const end = starts[i + 1]?.index ?? code.length
    const text = code.slice(start.index, end)
    const openParen = text.indexOf('(')
    const openBrace = text.indexOf('{', openParen)
    return {
      name: start.name,
      signature: text.slice(0, openBrace),
      body: text.slice(openBrace),
    }
  })
}

describe('the supplier dashboard scopes every service-role read', () => {
  const code = codeOnly(source(SUPPLIER_QUERIES))
  const functions = exportedFunctions(code)

  it('reads the file it claims to, so an empty sweep cannot pass', () => {
    expect(functions.length).toBeGreaterThanOrEqual(4)
    expect(code).toContain('createAdminClient')
  })

  for (const fn of functions) {
    it(`${fn.name} takes a supplierId and filters on it`, () => {
      expect(fn.signature).toMatch(/supplierId\s*:\s*string/)
      // .eq for one supplier, .in for a member of several. Either scopes the
      // read; neither present means the query returns every supplier's rows.
      const filtered =
        /\.eq\(\s*'supplier_id'\s*,\s*supplierId\s*\)/.test(fn.body) ||
        /\.in\(\s*'supplier_id'\s*,/.test(fn.body)
      expect(filtered).toBe(true)
    })
  }

  /**
   * The filter has to be the caller's own id, not one the caller supplied. Every
   * supplierId in the portal originates in `getSupplierSession` or
   * `getSupplierMemberships`, both of which read `supplier_members` for
   * `auth.uid()` through the USER-scoped client. A query module that derived a
   * supplier id from a request instead would satisfy the test above and still be
   * wrong, so the origin is pinned too.
   */
  it('derives the id from membership, never from a request', () => {
    const rbac = codeOnly(source('src/lib/supplier/rbac.ts'))
    expect(rbac).toContain("from('supplier_members')")
    expect(rbac).toContain("eq('user_id', user.id)")
    expect(rbac).toContain("eq('is_active', true)")
    // createClient, not createAdminClient: RLS must apply to the query that
    // establishes who the caller is, or the answer is whatever they asked for.
    expect(rbac).toContain("from '@/lib/supabase/server'")
    expect(rbac).not.toContain('createAdminClient')
  })

  /**
   * getSupplierMemberships returns EVERY active membership and
   * getSupplierSession returns the earliest one. A member of two suppliers must
   * not be refused their second supplier's own vouchers, which is why the
   * redemption path uses the first and the portal chrome uses the second.
   */
  it('keeps the full membership set available, not only the first', () => {
    const rbac = codeOnly(source('src/lib/supplier/rbac.ts'))
    expect(rbac).toContain('export async function getSupplierMemberships')
    const memberships = rbac.slice(rbac.indexOf('export async function getSupplierMemberships'))
    expect(memberships).not.toContain('.limit(1)')
  })
})

describe('the voucher scanner cannot be pointed at another business', () => {
  /**
   * `redeem_voucher()` derives the supplier from the caller's own membership,
   * which is why the route must call it with the CALLER's client and not the
   * admin one. `identityScopedClient` is that client. If this ever became
   * `createAdminClient`, `auth.uid()` would be null inside the function and the
   * supplier would have to come from the request body -- which is a till
   * redeeming another business's vouchers.
   */
  it('calls the RPC as the caller, not as service_role', () => {
    const route = codeOnly(source('src/app/api/supplier/vouchers/redeem/route.ts'))
    expect(route).toContain('identityScopedClient')
    // The client the RPC is called on is destructured out of `scoped`, so what
    // matters is that the name bound there is the one used, and that the admin
    // client is not.
    expect(route).toMatch(/const \{ client: supabase[^}]*\} = scoped/)
    expect(route).toMatch(/supabase\.rpc\(\s*'redeem_voucher'/)
    expect(route).not.toMatch(/admin\.rpc\(\s*'redeem_voucher'/)
  })

  /**
   * The one admin-client read on that route stamps a staff name onto a
   * redemption. It re-checks that the caller is a member of the staff row's
   * supplier before it does, because service_role skipped the policy that
   * would otherwise have said so.
   */
  it('re-checks membership before the one service-role write it makes', () => {
    const route = codeOnly(source('src/app/api/supplier/vouchers/redeem/route.ts'))
    const stamp = route.slice(route.indexOf('async function stampStaff'))
    expect(stamp).toContain("from('supplier_members')")
    expect(stamp).toContain("eq('user_id', userId)")
    expect(stamp).toContain("eq('supplier_id', staff.supplier_id)")
  })
})
