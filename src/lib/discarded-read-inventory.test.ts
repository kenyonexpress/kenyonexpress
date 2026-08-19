import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * A RATCHET OVER `const { data } = await supabase...`, because four cycles of
 * fixing this one file at a time is not the same as fixing it.
 *
 * WHAT THE DEFECT IS. A PostgREST query never rejects. It resolves with
 * `{ data: null, error: {...} }`, so a destructure that names only `data` turns
 * every failure into an absence, and the caller renders that absence as a fact.
 * On 2026-08-20 that exact line produced, in five different files:
 *
 *   a cached empty shop                  (category-page, feeds, sitemap)
 *   a cart DELETED from the database     (load-products -> removeUnavailable)
 *   a duplicated cart row, then a cart   (mergeGuestCart -> getCartRow)
 *   that read empty forever
 *   "this paid voucher does not exist"   (queries/vouchers -> /scan lookup),
 *   plus a refusal row in the audit log  said about a lookup that never ran
 *   "you have no orders", and a coupon   (queries/orders)
 *   shown with no code and no QR
 *   a false "charged with no order here" (cardcom webhook), answered 200, which
 *   page, on a payment we do hold        stops the retries for a real event
 *
 * WHY A COUNT AND NOT A BAN. Some of these are right. `stock-live.ts` never
 * throws on purpose (a missing scarcity badge beats a 500 on the product page),
 * `finalize.ts` drops a notification insert rather than roll back a wallet the
 * customer can already spend from, and the order page's invoice read is written
 * for 42P01 on a database where migration 107 is unapplied. A blanket ban would
 * have to be argued down in each of those, every time.
 *
 * SO THIS IS NOT A CLAIM THAT THE 80 BELOW ARE CORRECT. It is the claim that
 * they are the ones that exist TODAY, all of them known, none of them new. A
 * number that goes UP is a discarded error nobody looked at. A number that goes
 * DOWN is a fix, and lowering the entry here is how it is recorded.
 *
 * The rule is the one the cached-reader cycles arrived at the hard way, twice:
 * the sweep is the fix, not the file.
 */

const SRC = join(process.cwd(), 'src')

/**
 * `const { data } = await ...`, or `const { data: rows } = await ...`, where
 * what is awaited reaches a PostgREST builder. Naming `error` in the
 * destructure - `const { data, error }` - does not match, which is the whole
 * point: that shape is the fix.
 */
const DISCARDED_READ = /const \{\s*data(?:\s*:\s*\w+)?\s*\}\s*=\s*await/g
const REACHES_POSTGREST = /\.from\(|\.rpc\(/

/** file -> how many discarded reads it holds today. */
const INVENTORY: Record<string, number> = {
  'src/app/(account)/account/orders/[id]/invoice/route.ts': 1,
  'src/app/(admin)/admin/approvals/page.tsx': 1,
  'src/app/(admin)/admin/categories/new/page.tsx': 1,
  'src/app/(admin)/admin/categories/page.tsx': 1,
  'src/app/(admin)/admin/coupons/codes/[id]/page.tsx': 1,
  'src/app/(admin)/admin/coupons/codes/page.tsx': 1,
  'src/app/(admin)/admin/coupons/new/page.tsx': 1,
  'src/app/(admin)/admin/coupons/page.tsx': 1,
  'src/app/(admin)/admin/orders/[id]/page.tsx': 1,
  'src/app/(admin)/admin/orders/page.tsx': 1,
  'src/app/(admin)/admin/payments/page.tsx': 2,
  'src/app/(admin)/admin/payouts/page.tsx': 1,
  'src/app/(admin)/admin/users/[id]/page.tsx': 1,
  'src/app/(admin)/admin/vendors/[id]/page.tsx': 1,
  'src/app/api/cron/abandoned-cart/route.ts': 2,
  'src/app/api/supplier/vouchers/redeem/route.ts': 2,
  'src/app/auth/callback/route.ts': 1,
  'src/components/home/FeaturedProducts.tsx': 1,
  'src/lib/admin/rbac.ts': 1,
  'src/lib/search/indexer.ts': 1,
  'src/lib/supplier/rbac.ts': 2,
  'src/proxy.ts': 1,
  'src/server/actions/admin/affiliates.ts': 1,
  'src/server/actions/admin/approvals.ts': 2,
  'src/server/actions/admin/orders.ts': 1,
  'src/server/actions/admin/payments.ts': 2,
  'src/server/actions/admin/products.ts': 1,
  'src/server/actions/admin/users.ts': 1,
  'src/server/actions/auth.ts': 1,
  'src/server/actions/cart.ts': 4,
  'src/server/actions/gifts.ts': 2,
  'src/server/actions/newsletter.ts': 2,
  'src/server/actions/orders.ts': 1,
  'src/server/actions/payments/checkout.ts': 7,
  'src/server/actions/payments/refund.ts': 6,
  'src/server/domain/vouchers/issue.ts': 1,
  'src/server/payments/finalize.ts': 6,
  'src/server/payments/gift-vouchers.ts': 1,
  'src/server/payments/invoices.ts': 10,
  'src/server/payments/voucher-email.ts': 3,
  'src/server/queries/subscriptions.ts': 1,
  'src/server/queries/vouchers.ts': 1,
}

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, acc)
    else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) acc.push(full)
  }
  return acc
}

function countDiscardedReads(source: string): number {
  let count = 0
  for (const match of source.matchAll(DISCARDED_READ)) {
    const after = source.slice(match.index + match[0].length, match.index + match[0].length + 400)
    if (REACHES_POSTGREST.test(after)) count++
  }
  return count
}

const COUNTS = new Map<string, number>()
for (const file of walk(SRC)) {
  const rel = file.slice(process.cwd().length + 1).replaceAll('\\', '/')
  const count = countDiscardedReads(readFileSync(file, 'utf8'))
  if (count > 0) COUNTS.set(rel, count)
}

describe('reads that discard their error', () => {
  it('adds none that are not already on the inventory', () => {
    const added = [...COUNTS]
      .filter(([rel, count]) => count > (INVENTORY[rel] ?? 0))
      .map(([rel, count]) => `${rel}: ${count} (inventory says ${INVENTORY[rel] ?? 0})`)

    expect(
      added,
      'a query that discards its `error` renders failure as absence: name `error` and handle it, or add the file here with the reason',
    ).toEqual([])
  })

  it('keeps the inventory honest when one is fixed', () => {
    // Not symmetry for its own sake. Without this the list drifts into a
    // record of what USED to be wrong, and then it can absorb a new discard in
    // a file that also had one removed.
    const stale = [...Object.entries(INVENTORY)]
      .filter(([rel, count]) => count > (COUNTS.get(rel) ?? 0))
      .map(
        ([rel, count]) => `${rel}: inventory says ${count}, file now has ${COUNTS.get(rel) ?? 0}`,
      )

    expect(stale, 'fixed one? lower the number here (or delete the line)').toEqual([])
  })

  it('finds the discards it is counting, so a rename cannot empty this test', () => {
    // Without this the suite would pass just as happily if the regex stopped
    // matching anything at all - which is how a guard becomes decoration.
    expect(COUNTS.size).toBeGreaterThan(30)
    expect([...COUNTS.values()].reduce((a, b) => a + b, 0)).toBeGreaterThan(70)
  })

  it('does not match a read that names its error', () => {
    expect(countDiscardedReads('const { data, error } = await supabase.from("t").select()')).toBe(0)
    expect(countDiscardedReads('const { data } = await supabase.from("t").select()')).toBe(1)
    expect(countDiscardedReads('const { data: rows } = await admin.rpc("f")')).toBe(1)
    // Not a database read at all.
    expect(countDiscardedReads('const { data } = await axios.get("/x")')).toBe(0)
  })
})
