import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Invariants over supabase/rls-smoke.json (scripts/rls-smoke.mjs), measured on
 * production inside rolled-back transactions.
 *
 * rls-role-matrix.test.ts asks how many rows each role sees; this asks whose.
 * A plain customer reads no other user's order, voucher or wallet row, and
 * writes none of those tables at all, including its own rows: every money
 * write goes through a server path on the service key.
 */

type Probe = Record<string, string>
const artifact = JSON.parse(
  readFileSync(resolve(process.cwd(), 'supabase/rls-smoke.json'), 'utf8'),
) as {
  measured_at: string
  control_service_role: Record<string, number>
  results: Record<string, Probe>
}

function probe(role: string): Probe {
  const result = artifact.results[role]
  if (!result) throw new Error(`no measurement for ${role}; re-run scripts/rls-smoke.mjs`)
  return result
}

const ROLES = ['anon', 'customer', 'customer_with_wallet', 'customer_no_orders']
const FOREIGN_READS = [
  'orders_foreign',
  'order_items_foreign',
  'vouchers_foreign',
  'voucher_redemptions_foreign',
  'wallet_accounts_foreign',
  'wallet_entries_foreign',
]
const WRITES = [
  'orders_insert',
  'orders_update_own',
  'orders_update_any',
  'orders_delete_any',
  'order_items_update_any',
  'vouchers_update_own',
  'vouchers_update_any',
  'vouchers_insert',
  'voucher_redemptions_insert',
  'wallet_accounts_update_own',
  'wallet_accounts_insert',
  'wallet_entries_insert',
  'wallet_entries_delete_any',
]

describe('RLS smoke: orders, vouchers, wallet', () => {
  it('measured every role', () => {
    expect(Object.keys(artifact.results).sort()).toEqual([...ROLES].sort())
  })

  it('the control sees foreign rows, so a 0 below means something', () => {
    for (const key of FOREIGN_READS) {
      expect(artifact.control_service_role[key], key).toBeGreaterThan(0)
    }
  })

  it('no probe errored (a renamed column must not read as a pass)', () => {
    for (const role of ROLES) {
      for (const [key, value] of Object.entries(probe(role))) {
        expect(value.startsWith('error:'), `${role}.${key}=${value}`).toBe(false)
      }
    }
  })

  it.each(ROLES)('%s reads no row owned by another user', (role) => {
    for (const key of FOREIGN_READS) {
      expect(['0', 'denied'], `${role}.${key}`).toContain(probe(role)[key])
    }
  })

  it.each(ROLES)('%s changes no row in any money table', (role) => {
    for (const key of WRITES) {
      expect(['0', 'denied'], `${role}.${key}`).toContain(probe(role)[key])
    }
  })

  it('the owner branch still works: customers read their own rows', () => {
    expect(Number(probe('customer').orders_own)).toBeGreaterThan(0)
    expect(Number(probe('customer_with_wallet').wallet_accounts_own)).toBeGreaterThan(0)
    expect(probe('anon').orders_own).toBe('0')
  })
})
