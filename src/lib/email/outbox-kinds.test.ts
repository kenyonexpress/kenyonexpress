import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { buildNotification } from '@/lib/email/notifications'
import { describe, expect, it } from 'vitest'

/**
 * THE THREE-WAY AGREEMENT THIS FILE EXISTS TO KEEP.
 *
 * A notification only works if three separate lists agree:
 *
 *   1. the `notification_outbox_kind_check` CONSTRAINT, which decides whether
 *      the row can be inserted at all;
 *   2. the kinds the application actually enqueues, scattered across cron
 *      routes, the finalize path and the auth callback;
 *   3. `buildNotification`, which decides whether the drain can render it.
 *
 * Nothing checked that they agree, and on 2026-08-19 they did not. Measured
 * against production with a rolled-back DO block that tried all ten kinds the
 * code emits:
 *
 *   ACCEPTED: order_paid, supplier_sale, voucher_redeemed, voucher_issued, voucher_gifted
 *   REJECTED: voucher_expiring, cashback_credited, invoice_dead, low_stock, reconciliation_gap
 *
 * `fn_enqueue_notification` does a plain INSERT, so all five raised 23514 back
 * at the caller. Silently dead in production: the coupon-expiry reminder
 * sweep, the cashback mail inside the payment finalize path, and all three
 * operator alerts -- including the reconciliation-gap alert, whose entire job
 * is to be the thing that tells a human the money does not add up.
 *
 * WHY A CONSTANT AND NOT A QUERY. CI has no database, the same standing
 * constraint as `supabase/rls-manifest.json`. So what is committed is a
 * measurement plus the rules it has to satisfy. Re-measure with:
 *
 *   select pg_get_constraintdef(oid) from pg_constraint
 *    where conname = 'notification_outbox_kind_check';
 */
const CHECK_ACCEPTS = [
  'order_paid',
  'supplier_sale',
  'voucher_redeemed',
  'voucher_issued',
  'voucher_gifted',
  'voucher_expiring',
  'cashback_credited',
  'invoice_dead',
  'low_stock',
  'reconciliation_gap',
  'refund_completed',
  'welcome',
] as const

const MEASURED_AT = '2026-08-19'

/** A payload fat enough that every builder's own guards are satisfied. */
const PAYLOAD: Record<string, unknown> = {
  order_id: '11111111-2222-3333-4444-555555555555',
  order_ref: 'ORDER1',
  total_agorot: 5000,
  item_count: 1,
  amount_agorot: 2500,
  refunded_agorot: 12500,
  cancellation_fee_agorot: 0,
  voucher_id: '99999999-8888-7777-6666-555555555555',
  code: 'ABCD-EFGH',
  product_name: 'מוצר',
  supplier_name: 'ספק',
  days_remaining: 3,
  reason: 'provider rejected',
  document_type: 'חשבונית',
  product_id: '77777777-6666-5555-4444-333333333333',
  available: 2,
  stock_quantity: 4,
  threshold: 5,
  day: '2026-08-19',
  critical: 1,
  rows: [{ transactionId: 'tx1', terminalAgorot: 100, localAgorot: 90 }],
  full_name: 'דנה',
}

const SITE = 'https://kenyonexpress.co.il'

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) {
      sourceFiles(path, out)
    } else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
      out.push(path)
    }
  }
  return out
}

describe('the outbox kinds three lists have to agree on', () => {
  it('was measured, and says when', () => {
    expect(MEASURED_AT).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('renders every kind the constraint accepts', () => {
    // A kind the CHECK lets in but no builder can render is a row the drain
    // parks forever: no mail, no error anyone reads.
    for (const kind of CHECK_ACCEPTS) {
      expect(buildNotification(kind, PAYLOAD, SITE), `no builder for ${kind}`).not.toBeNull()
    }
  })

  it('refuses a kind nobody renders', () => {
    expect(buildNotification('not_a_kind', PAYLOAD, SITE)).toBeNull()
  })

  it('enqueues nothing the constraint would reject', () => {
    // THE ACTUAL 2026-08-19 BUG, in the form that catches it next time. Every
    // `p_kind:` and `kind:` literal handed to the outbox anywhere in src must
    // be a value the constraint accepts.
    const accepted = new Set<string>(CHECK_ACCEPTS)
    const offenders: string[] = []

    for (const file of sourceFiles(resolve(process.cwd(), 'src'))) {
      const source = readFileSync(file, 'utf8')
      for (const match of source.matchAll(/p_kind:\s*'([a-z_]+)'/g)) {
        if (!accepted.has(match[1])) offenders.push(`${file}: p_kind '${match[1]}'`)
      }
      // The direct-insert form, narrowed to files that name the table so a
      // `kind:` on some unrelated object does not read as a false positive.
      if (source.includes('notification_outbox')) {
        for (const match of source.matchAll(/\bkind:\s*'([a-z_]+)'/g)) {
          if (!accepted.has(match[1])) offenders.push(`${file}: kind '${match[1]}'`)
        }
      }
    }

    expect(offenders).toEqual([])
  })
})
