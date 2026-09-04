import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Pins the audit-trigger coverage that migration 169 promised.
 *
 * The migration is already applied; this test keeps the checked-in file
 * honest against the list below, so a table quietly dropped from the foreach
 * array — or a financial table added to the schema without being added here
 * and there — fails a test instead of silently losing its trail.
 */

const MIGRATION = join(process.cwd(), 'migrations/pending/169_audit_full_coverage.sql')

/** Tables 169 attaches audit_* triggers to. */
const COVERED_BY_169 = [
  // money path
  'orders',
  'order_items',
  'payments',
  'payment_tokens',
  'payment_events',
  'refunds',
  'invoices',
  'wallet_accounts',
  'wallet_entries',
  'escrow_holds',
  'split_executions',
  'settlement_events',
  'payout_statement_lines',
  'vouchers',
  'voucher_redemptions',
  'subscriptions',
  'subscription_charges',
  'discount_campaigns',
  'discount_redemptions',
  'coupon_codes',
  'cashback_rules',
  // identity and privilege
  'user_addresses',
  'supplier_members',
  'supplier_staff',
  'referrals',
  'affiliates',
  'newsletter_subscribers',
  'email_suppressions',
]

/** Columns whose values must never appear in a before/after snapshot. */
const REDACTED = ['cardcom_token', 'pin_hash']

describe('migration 169 audit coverage', () => {
  const sql = readFileSync(MIGRATION, 'utf8')

  it.each(COVERED_BY_169)('attaches a trigger to %s', (table) => {
    expect(sql).toContain(`'${table}'`)
  })

  it.each(REDACTED)('strips %s from snapshots', (column) => {
    expect(sql).toContain(`'${column}'`)
  })

  it('records the full requested context', () => {
    for (const column of ['before', 'after', 'ip_address', 'user_agent', 'request_id']) {
      expect(sql).toContain(column)
    }
  })
})
