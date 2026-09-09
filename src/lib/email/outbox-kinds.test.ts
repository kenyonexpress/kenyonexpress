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
  'account_deleted',
  'order_shipped',
] as const

/**
 * Kinds the constraint accepts that `buildNotification` cannot render.
 *
 * This list is the disagreement made visible instead of hidden. Leaving
 * `account_deleted` out of CHECK_ACCEPTS would have kept this file green while
 * the mirror silently stopped describing production, which is the one failure
 * mode the header is about.
 *
 * `account_deleted` entered the live constraint with 150 and no builder was
 * ever written for it. Nothing enqueues it either -- the delete path in
 * src/server/actions/account.ts deliberately sends no goodbye mail -- so no row
 * can park today. It is a loaded gun on the shelf, not a fire.
 *
 * The inverted assertion below is what stops this list from rotting: write
 * buildAccountDeletedEmail and this file goes red telling you to move the name
 * up into CHECK_ACCEPTS.
 */
const CHECK_ACCEPTS_BUT_RENDERS_NOTHING: readonly string[] = ['account_deleted']

/**
 * The other direction: kinds this application can RENDER and ENQUEUE, that the
 * live constraint does not accept yet.
 *
 * `price_drop` and `back_in_stock` arrive with `migrations/pending/200`, and
 * `/api/cron/wishlist-alerts` enqueues both. Until 200 is applied the insert
 * fails with 23514.
 *
 * THIS IS NOT AN EXCUSE LIST, and the assertion below is what keeps it from
 * becoming one: every name here must have a caller that HANDLES `23514`. That
 * is the difference between "shipped ahead of its migration" and "shipped
 * broken" — the first degrades to sending nothing and says so, the second
 * throws in a cron at five in the morning.
 *
 * `order_shipped` was in this state before 183 and never appeared here, because
 * its enqueuer is a database trigger and this scan only reads `src`. That is a
 * real limit of the gate and worth naming rather than leaving to be
 * rediscovered.
 */
const RENDERS_BUT_CONSTRAINT_REJECTS: readonly string[] = ['price_drop', 'back_in_stock']

// Re-measured 2026-09-09, when 183 restated the constraint. The live list had
// grown from twelve to fourteen since the 08-19 measurement: `account_deleted`
// (150) and `order_shipped` (183). 183 as drafted restated only the twelve it
// knew plus order_shipped, which would have DROPPED account_deleted; the
// preflight caught it and the file was corrected before it was applied.
const MEASURED_AT = '2026-09-09'

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
  // The wishlist alerts' own guards: `buildPriceDropEmail` returns null without
  // a new price, and `buildBackInStockEmail` without a product name (which the
  // fixture already carries above). Both refusals are correct -- a mail
  // announcing a drop it cannot state is worse than none -- so the fixture
  // satisfies them rather than the builders relaxing.
  product_slug: 'עיסוי-מפנק',
  saved_agorot: 19_900,
  now_agorot: 14_900,
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
      if (CHECK_ACCEPTS_BUT_RENDERS_NOTHING.includes(kind)) continue
      expect(buildNotification(kind, PAYLOAD, SITE), `no builder for ${kind}`).not.toBeNull()
    }
  })

  it('keeps the known-unrenderable list honest in both directions', () => {
    // Every name on it must be a kind the constraint really accepts, so the
    // list cannot quietly excuse a typo...
    for (const kind of CHECK_ACCEPTS_BUT_RENDERS_NOTHING) {
      expect(CHECK_ACCEPTS as readonly string[], `${kind} is not in the constraint`).toContain(kind)
      // ...and must really have no builder, so the day somebody writes one this
      // goes red and asks for the name to be moved up.
      expect(
        buildNotification(kind, PAYLOAD, SITE),
        `${kind} renders now: move it out of CHECK_ACCEPTS_BUT_RENDERS_NOTHING`,
      ).toBeNull()
    }
  })

  it('makes every ahead-of-its-migration kind handle the rejection', () => {
    // The assertion that stops RENDERS_BUT_CONSTRAINT_REJECTS being an excuse
    // list. A kind the constraint refuses WILL produce 23514 on every run until
    // the migration lands, so its caller has to read that code and carry on.
    // Without this the list would simply switch the gate off for two names.
    for (const kind of RENDERS_BUT_CONSTRAINT_REJECTS) {
      expect(
        buildNotification(kind, PAYLOAD, SITE),
        `${kind} has no builder: it cannot be rendered when the migration lands`,
      ).not.toBeNull()

      const callers = sourceFiles(resolve(process.cwd(), 'src')).filter((file) =>
        new RegExp(`p_kind:\\s*'${kind}'`).test(readFileSync(file, 'utf8')),
      )
      expect(callers.length, `nothing enqueues ${kind}`).toBeGreaterThan(0)
      for (const file of callers) {
        expect(
          readFileSync(file, 'utf8'),
          `${file} enqueues ${kind} without handling 23514`,
        ).toContain('23514')
      }
    }
  })

  it('refuses a kind nobody renders', () => {
    expect(buildNotification('not_a_kind', PAYLOAD, SITE)).toBeNull()
  })

  it('enqueues nothing the constraint would reject', () => {
    // THE ACTUAL 2026-08-19 BUG, in the form that catches it next time. Every
    // `p_kind:` and `kind:` literal handed to the outbox anywhere in src must
    // be a value the constraint accepts.
    const accepted = new Set<string>([...CHECK_ACCEPTS, ...RENDERS_BUT_CONSTRAINT_REJECTS])
    const offenders: string[] = []

    for (const file of sourceFiles(resolve(process.cwd(), 'src'))) {
      const source = readFileSync(file, 'utf8')
      for (const match of source.matchAll(/p_kind:\s*'([a-z_]+)'/g)) {
        // `match[1]` is `string | undefined` under noUncheckedIndexedAccess even
        // though a matched group-1 always exists. `?? ''` keeps the check honest:
        // the empty string is not in the set, so a hypothetical miss is reported
        // rather than silently skipped.
        const kind = match[1] ?? ''
        if (!accepted.has(kind)) offenders.push(`${file}: p_kind '${kind}'`)
      }
      // The direct-insert form, narrowed to files that name the table so a
      // `kind:` on some unrelated object does not read as a false positive.
      if (source.includes('notification_outbox')) {
        for (const match of source.matchAll(/\bkind:\s*'([a-z_]+)'/g)) {
          const kind = match[1] ?? ''
          if (!accepted.has(kind)) offenders.push(`${file}: kind '${kind}'`)
        }
      }
    }

    expect(offenders).toEqual([])
  })
})
