import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The cashback ledger has to have callers. Same lesson as the referral
 * programme's wired.test.ts, learned there the hard way: a database feature
 * with no call site passes every unit test and does nothing in production.
 * So this file pins the wiring at the points where a missing call is
 * invisible: the finalize hook, the admin action's RPC, and the audit write.
 */

const root = process.cwd()

/** Comments discuss these names constantly. Only real code should satisfy a check. */
function code(file: string): string {
  return readFileSync(join(root, file), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
}

describe('the finalize hook', () => {
  it('awards the order-count bonus inside finalizeOrder, after the item cashback credit', () => {
    const finalize = code('src/server/payments/finalize.ts')
    expect(finalize).toContain('awardOrderCountBonus(admin, order.id)')
    // Order matters: the RPC mirrors the item-cashback wallet entry into the
    // ledger, so that entry must already exist when it runs.
    expect(finalize.indexOf('creditCashback(admin, order.id')).toBeLessThan(
      finalize.indexOf('awardOrderCountBonus(admin, order.id)'),
    )
  })

  it('calls the database rule, not a TypeScript copy of it', () => {
    expect(code('src/server/cashback/bonus.ts')).toContain("rpc('fn_cashback_order_bonus'")
  })
})

describe('the admin adjustment', () => {
  const action = code('src/server/actions/admin/cashback.ts')

  it('runs through the SECURITY DEFINER function', () => {
    expect(action).toContain("rpc('fn_cashback_admin_adjust'")
  })

  it('writes the app-side audit row every admin mutation writes', () => {
    expect(action).toContain('writeAuditLog(')
    expect(action).toContain("entityType: 'cashback_ledger'")
  })

  it('gates on the payments section before touching money', () => {
    expect(action).toContain("requireSection('payments', 'write')")
  })

  it('sends an idempotency key, so a double submit is one movement', () => {
    expect(action).toContain('p_idempotency')
  })
})

describe('the admin screen', () => {
  it('exists and is reachable from the sidebar', () => {
    expect(code('src/app/(admin)/admin/cashback/page.tsx')).toContain("from('cashback_ledger')")
    expect(code('src/components/admin/AdminSidebar.tsx')).toContain("'/admin/cashback'")
    expect(code('src/lib/admin/nav.ts')).toContain("'/admin/cashback'")
  })
})
