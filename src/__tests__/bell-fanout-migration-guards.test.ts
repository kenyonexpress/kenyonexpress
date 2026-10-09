import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * THE PROPERTIES 231 MUST NOT LOSE ON A REWRITE.
 *
 * `231_bell_fanout.sql` is the writer behind the in-app bell: an AFTER INSERT
 * trigger on `notification_outbox` composing the customer's Hebrew in the same
 * transaction as the event. Three of its properties were bought with a
 * measurement each, and a later edit that drops one of them fails quietly, so
 * they are pinned here the way whatsapp-migration-guards pins 173's.
 *
 * 1. THE EXCEPTION GUARD. The trigger sits downstream of `paid` transitions:
 *    an AFTER trigger that raises takes the customer's UPDATE down with it,
 *    which for order_paid means rolling back an order whose card was already
 *    charged (the exact failure 173 shipped with, proven there on production).
 *    Bell copy must never cost anyone their order.
 *
 * 2. THE EMPTY-STRING TRAP. `array_to_string` over an empty array returns ''
 *    and not NULL, so a bare coalesce never reaches the Hebrew fallback and
 *    the bell row ships an empty body. Caught by the rolled-back probe over
 *    production on 2026-09-10 (a payload with malformed money produced
 *    body='' instead of the fallback), fixed with nullif, pinned here.
 *
 * 3. THE KIND GATE. The outbox carries operator alerts and account_deleted;
 *    none of those may ring a customer's bell. The CASE lists exactly the
 *    customer-facing kinds, the ELSE swallows everything else, and a future
 *    kind stays out of the bell until its Hebrew is written. Push has the
 *    same contract in src/lib/push/templates.ts.
 */

const sql = readFileSync(resolve(process.cwd(), 'migrations/pending/231_bell_fanout.sql'), 'utf8')

/** Every kind the fanout CASE names, in file order. */
function caseKinds(): string[] {
  return [...sql.matchAll(/WHEN '([a-z_]+)' THEN/g)].map((m) => m[1] ?? '')
}

describe('231_bell_fanout.sql', () => {
  it('keeps the exception guard that protects the enqueuing transaction', () => {
    expect(sql).toMatch(/EXCEPTION WHEN OTHERS THEN/)
    expect(sql).toMatch(/RAISE WARNING 'tg_outbox_bell failed/)
    // The guard must end by letting the outbox INSERT through.
    expect(sql).toMatch(/RAISE WARNING[^;]+;\s*\n\s*RETURN NEW;/)
  })

  it('keeps the nullif around every array_to_string composition', () => {
    // Count code, not prose: the trap's own explanation names the function in
    // a `--` comment, and a comment is not an unguarded composition.
    const code = sql.replaceAll(/^\s*--.*$/gm, '')
    const compositions = code.match(/array_to_string/g) ?? []
    const guarded = code.match(/nullif\(array_to_string/g) ?? []
    expect(compositions.length).toBeGreaterThan(0)
    expect(guarded.length).toBe(compositions.length)
  })

  it('rings the bell for exactly the customer-facing kinds', () => {
    expect(caseKinds()).toEqual([
      'order_paid',
      'order_shipped',
      'voucher_issued',
      'voucher_gifted',
      'voucher_redeemed',
      'voucher_expiring',
      'cashback_credited',
      'refund_completed',
      'welcome',
      'price_drop',
      'back_in_stock',
    ])
    // The operator kinds and account_deleted must stay in the ELSE. If one of
    // these ever appears in the CASE, an operator alert rings a customer.
    for (const operatorKind of [
      'supplier_sale',
      'invoice_dead',
      'low_stock',
      'reconciliation_gap',
      'account_deleted',
    ]) {
      expect(caseKinds()).not.toContain(operatorKind)
    }
  })

  it('skips rows with no account to ring', () => {
    expect(sql).toMatch(/IF NEW\.user_id IS NULL THEN\s*\n\s*RETURN NEW;/)
  })

  it('writes only account-relative hrefs, matching the table CHECK', () => {
    const hrefs = [...sql.matchAll(/v_href\s*:=\s*'([^']*)'/g)].map((m) => m[1])
    expect(hrefs.length).toBeGreaterThan(0)
    for (const href of hrefs) {
      expect(href).toMatch(/^\/(account(\/|$)|$)/)
    }
  })

  it('leaves the new functions unreachable from client roles', () => {
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION public\.tg_outbox_bell\(\) FROM PUBLIC, anon, authenticated/,
    )
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION public\.fn_bell_agorot\(jsonb, text\) FROM PUBLIC, anon, authenticated/,
    )
  })

  it('re-asserts the realtime plumbing the bell dies silently without', () => {
    expect(sql).toMatch(/pubname = 'supabase_realtime'/)
    expect(sql).toMatch(/relreplident/)
  })
})
