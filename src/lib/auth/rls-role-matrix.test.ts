import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The pgTAP suite this project cannot run, as invariants over the matrix it
 * CAN measure (scripts/rls-role-matrix.mjs, supabase/rls-role-matrix.json).
 *
 * Every number here was read from production. The assertions are the
 * statements that must stay true whatever the counts are: nobody without a
 * session reads a money or identity table, a customer with no orders reads
 * none of anyone's, a supplier's member reads no customer identity or card,
 * and every table the RLS manifest knows is in the matrix at all.
 */

type Matrix = Record<string, Record<string, string>>
const artifact = JSON.parse(
  readFileSync(resolve(process.cwd(), 'supabase/rls-role-matrix.json'), 'utf8'),
) as { measured_at: string; matrix: Matrix }
const manifest = JSON.parse(
  readFileSync(resolve(process.cwd(), 'supabase/rls-manifest.json'), 'utf8'),
) as { tables: { table_name: string }[] }

const m = artifact.matrix

/** Tables that hold money, identity or credentials. Anon reads none of them. */
const SENSITIVE = [
  'orders',
  'order_items',
  'payments',
  'payment_tokens',
  'payment_webhook_events',
  'invoices',
  'vouchers',
  'voucher_redemptions',
  'wallet_accounts',
  'wallet_entries',
  'cashback_ledger',
  'refunds',
  'profiles',
  'user_addresses',
  'notifications',
  'carts',
  'settlement_events',
  'audit_log',
]

function hidden(value: string | undefined): boolean {
  return value === undefined || value === '0' || value === 'denied'
}

describe('the RLS role matrix', () => {
  it('was measured, and says when', () => {
    expect(artifact.measured_at).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('covers every table the RLS manifest names, for every role', () => {
    for (const role of ['anon', 'customer', 'customer_no_orders', 'supplier_member', 'admin']) {
      for (const { table_name } of manifest.tables) {
        expect(m[role]?.[table_name], `${role} / ${table_name}`).toBeDefined()
      }
    }
  })

  it('shows anon nothing from any money or identity table', () => {
    for (const table of SENSITIVE) {
      expect(hidden(m.anon?.[table]), `anon reads ${table}: ${m.anon?.[table]}`).toBe(true)
    }
  })

  it('shows a customer with no orders nothing of anyone else', () => {
    for (const table of [
      'orders',
      'order_items',
      'payments',
      'payment_tokens',
      'invoices',
      'vouchers',
      'wallet_entries',
      'cashback_ledger',
      'refunds',
      'user_addresses',
      'audit_log',
    ]) {
      expect(hidden(m.customer_no_orders?.[table]), `no-orders customer reads ${table}`).toBe(true)
    }
    // Their own profile and their own (empty) wallet account, nothing more.
    expect(m.customer_no_orders?.profiles).toBe('1')
  })

  it("keeps customer cards, invoices and wallets away from a supplier's member", () => {
    for (const table of [
      'payments',
      'payment_tokens',
      'invoices',
      'wallet_entries',
      'cashback_ledger',
      'refunds',
    ]) {
      expect(hidden(m.supplier_member?.[table]), `supplier reads ${table}`).toBe(true)
    }
    expect(m.supplier_member?.profiles).toBe('1')
  })

  it('lets an admin read orders, payments and vouchers through RLS, and the service role everything', () => {
    for (const table of ['orders', 'payments', 'vouchers', 'order_items', 'profiles']) {
      expect(Number(m.admin?.[table]), table).toBeGreaterThanOrEqual(Number(m.customer?.[table]))
      expect(Number(m.service_role?.[table]), table).toBeGreaterThanOrEqual(
        Number(m.admin?.[table]),
      )
    }
  })

  it('gives an admin NO row-level path to invoices or card tokens: those screens run on the service role', () => {
    // Measured, not designed: `invoices: owner read` is the only SELECT policy
    // on invoices, and payment_tokens has none for admins. /admin/invoices and
    // the token views read with createAdminClient(). A future "admin read"
    // policy would flip these two lines, and should, on purpose.
    expect(m.admin?.invoices).toBe('0')
    expect(m.admin?.payment_tokens).toBe('0')
    expect(Number(m.service_role?.invoices)).toBeGreaterThan(0)
  })
})
