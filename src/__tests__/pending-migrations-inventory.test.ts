import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * THE PENDING-MIGRATION MANIFEST AND THE DIRECTORY MUST AGREE, BOTH WAYS.
 *
 * WHY THIS IS WORTH A TEST. `migrations/pending/README.md` is the only
 * navigation anyone has across unapplied schema changes, and it is read at the
 * moment somebody is about to change production. It has been wrong three times:
 *
 *   19.08  named `002-products-geo.sql`, deleted, its columns already live.
 *   19.08  named `PENDING-revoke_anon_writes.sql`, which was never written --
 *          a SECURITY migration whose listing read as "awaiting approval".
 *   01.09  claimed production already stored money as integer agorot, so
 *          `PENDING-money-integer-fix.sql` was a no-op. Measured against
 *          production the same day: all 41 target columns were still numeric.
 *          Deleting the file on that claim would have thrown away the only
 *          written description of the in-place conversion.
 *
 * Every one of those is the same failure: a filename or a claim in prose with
 * nothing behind it, in a document a reader trusts INSTEAD of checking.
 *
 * WHAT IT DOES NOT DO. It does not check that a migration is correct, or that
 * it has not been applied. Only production can answer the second question and
 * this suite has no database. It checks the cheap thing that keeps going wrong:
 * that the manifest and the directory describe the same set of files.
 */

const PENDING_DIR = 'migrations/pending'
// Applied through MCP on 2026-09-03 and moved here out of `pending/`. The
// README stays the manifest for both: it is the only written description of
// what each file does, and a reader checking "was this applied" needs the row
// to still exist. What changed is which directory the row's file lives in.
const APPLIED_DIR = 'migrations/applied'
// Written, then rejected before ever touching production, and kept because a
// cancelled number must stay burned: 165 was cancelled on 2026-09-04
// (CLOSEOUT §13) when its own preflight's stop-and-think came back positive.
const CANCELLED_DIR = 'migrations/cancelled'
const SUPABASE_DIR = 'supabase/migrations'

function readmeText(): string {
  return readFileSync(resolve(process.cwd(), PENDING_DIR, 'README.md'), 'utf8')
}

function sqlFilesIn(dir: string, filter: (name: string) => boolean = () => true): string[] {
  return readdirSync(resolve(process.cwd(), dir))
    .filter((name) => name.endsWith('.sql') && filter(name))
    .sort()
}

/** Every `NNN_name.sql` the manifest names, deduplicated, in file order. */
/** The `NNN` prefix of every SQL file in `dir`, letters (135a/135b) trimmed. */
function numbersOf(dir: string): string[] {
  return sqlFilesIn(dir)
    .map((n) => n.slice(0, 3))
    .filter((n) => /^\d{3}$/.test(n))
}

function manifestFilenames(): string[] {
  // `\d{3}[a-z]?_` and not `\d{3}_`: a migration that has to be split keeps its
  // number and takes a letter, the way production recorded 135 as
  // `135a_product_type_recurring` and `135b_recurring_subscriptions`. The
  // stricter pattern silently skipped both, so the manifest looked complete
  // while naming neither, which is the exact failure this file exists to catch.
  return [...new Set(readmeText().match(/\d{3}[a-z]?_[\w-]+\.sql/g) ?? [])].sort()
}

describe('the pending migration inventory', () => {
  it('holds exactly the renumbered files this list names, nothing else', () => {
    // A new pending migration is a deliberate diff here, which is the point:
    // schema changes are the one category where a silent addition is expensive.
    // The list moved wholesale into `applied/` on 2026-09-03; the assertion is
    // still "these and nothing else", now against that directory, because the
    // alternative -- deleting the list -- would drop the only record of which
    // numbers exist.
    //
    // TWO NUMBERS APPEAR TWICE HERE AND THAT IS HISTORY, NOT A DEFECT.
    // Production spent 169 on `audit_full_coverage_169` (20260904001341) and
    // AGAIN on `analytics_server_event_names_169` (20260908200555), and spent
    // 172 on `rls_zero_policy_tables_172` plus the ad-hoc write that hid the
    // one-shekel test row. A number production has burned cannot be reclaimed
    // by renaming the file, so both members of each pair stay. The invariant
    // that IS enforceable is one directory down: no number may be shared
    // between `pending/` and `applied/` -- see the numbering test below.
    expect(sqlFilesIn(APPLIED_DIR, (n) => !n.startsWith('preflight_'))).toEqual([
      '122_deny_all_on_server_only_tables.sql',
      '123_products_whatsapp_enabled.sql',
      '124_categories_sort_order.sql',
      '125_expire_vouchers_drop_escrow.sql',
      '126_percent_range_checks.sql',
      '127_homepage_cms.sql',
      '130_payment_events.sql',
      '131_refunds.sql',
      '132_search_index_outbox.sql',
      '133_supplier_branches.sql',
      '134_order_items_delivered_at.sql',
      '135a_product_type_recurring.sql',
      '135b_recurring_subscriptions.sql',
      '136_supplier_coordinates.sql',
      '137_order_transition_guard.sql',
      '138_money_agorot_money_path.sql',
      '139_money_agorot_wallet.sql',
      '140_money_agorot_catalog.sql',
      '141_money_agorot_growth.sql',
      '143_revoke_unused_definer_execute.sql',
      '144_revoke_authenticated_dml.sql',
      '145_revoke_check_rate_limit_execute.sql',
      '146_wallet_balance_floor.sql',
      '147_money_agorot_remaining_twins.sql',
      '148_refund_destination.sql',
      '149_audit_log_append_only.sql',
      '150_account_deletion.sql',
      '151_analytics_ingest.sql',
      '152_payout_machinery.sql',
      '153_ai_usage.sql',
      '154_reviews_wishlist.sql',
      '155_shipment_tracking.sql',
      '156_analytics_indexes.sql',
      '157_audit_ip_retention.sql',
      '158_revoke_anon_public_on_new_functions.sql',
      '159_pin_search_path_and_revoke_enqueue.sql',
      '160_fk_indexes.sql',
      '161_enable_pg_cron_pg_net.sql',
      '163_orders_indexes.sql',
      '166_voucher_transition_guard.sql',
      '167_order_items_money_constraints.sql',
      '168_wallet_ledger_client_readonly.sql',
      '169_analytics_server_event_names.sql',
      '169_audit_full_coverage.sql',
      '170_reporting_tables.sql',
      '171_search_fts.sql',
      '172_hide_master_product_test_row.sql',
      '172_rls_zero_policy_tables.sql',
      '173_whatsapp_flow.sql',
      '177_cashback_ledger.sql',
      '178_webauthn_credentials.sql',
      '179_push_subscriptions.sql',
      '180_analytics_server_event_names.sql',
      '181a_read_only_enum.sql',
      '181b_admin_rbac_hardening.sql',
      '182_coupon_qr_batches.sql',
      '183_order_shipped_notification.sql',
      '185_soft_delete_user_facing_remainder.sql',
      '186_composite_indexes_top_queries.sql',
      '187_category_name_shekel_order.sql',
      '192_seed_seo_redirects.sql',
      '193_price_history.sql',
      '194_discount_claim_caps.sql',
      '195_stock_waitlist.sql',
      '196_shipped_notification_carries_tracking.sql',
      '197_shipping_zones_and_pickup.sql',
      '198_in_app_notifications.sql',
      '199_review_replies_and_reports.sql',
      '200_wishlist_alert_kinds.sql',
      '201_scheduled_price_changes.sql',
      '210_media_ingest_queue.sql',
      '212_rbac_truncate_and_search_path.sql',
      '215_cashback_expiry.sql',
    ])
  })

  it('carries a checksum line for every applied file, preflights included', () => {
    // The 2026-09-04 audit found 166-168 live in production while the repo
    // still listed them as pending: the directory and the database can drift.
    // A checksum pins WHICH bytes a filename stood for when it was recorded,
    // so a later edit to an applied file cannot silently rewrite history.
    // Regenerate after a legitimate move:
    //   cd migrations/applied && shasum -a 256 *.sql > CHECKSUMS.sha256
    // Verify: shasum -c CHECKSUMS.sha256
    const lines = readFileSync(resolve(process.cwd(), APPLIED_DIR, 'CHECKSUMS.sha256'), 'utf8')
      .trim()
      .split('\n')
    const checksummed = lines.map((l) => l.split(/\s+/)[1]).sort()
    expect(checksummed).toEqual(sqlFilesIn(APPLIED_DIR))
    for (const line of lines) {
      expect(line).toMatch(/^[0-9a-f]{64}\s+\S+\.sql$/)
    }
  })

  // ---- direction 1: disk -> manifest -------------------------------------
  it('names every file that is on disk', () => {
    const named = new Set(manifestFilenames())
    // preflight_NNN.sql files are audit companions (read-only execute_sql
    // blocks run BEFORE their migration), not migrations; the NNN_ manifest
    // regex cannot name them and they are asserted by filename in the
    // pending-contents test below instead.
    const onDisk = [
      ...sqlFilesIn(PENDING_DIR, (n) => !n.startsWith('preflight_')),
      ...sqlFilesIn(APPLIED_DIR, (n) => !n.startsWith('preflight_')),
      ...sqlFilesIn(CANCELLED_DIR, (n) => !n.startsWith('preflight_')),
    ].sort()
    const unlisted = onDisk.filter((name) => !named.has(name))
    expect(
      unlisted,
      `these files are in ${PENDING_DIR} or ${APPLIED_DIR} but have no row in README.md: ${unlisted.join(', ')}`,
    ).toEqual([])
  })

  // ---- what is actually unapplied right now -------------------------------
  it('holds exactly the migrations still awaiting approval', () => {
    // WHAT IS ACTUALLY UNAPPLIED, read off production on 2026-09-09 rather
    // than inferred from the directory. Every file below was probed for the
    // objects it creates and production has none of them:
    //
    //   162_cron_schedule                approved (CLOSEOUT §7), blocked on vault
    //                                    seeding -- see "## חסמים לאופיר" in STATE.md
    //   184_orders_monthly_partitioning  orders_flat, orders_invoice_numbers: absent
    //
    // 184 IS NOT APPLIED AND THAT IS THE DECISION, not a pending question.
    // It rebuilds the table every order lives in, and the project recorded it
    // as needing a maintenance window on 09-04. Reading production on 09-09
    // also found it stale in two ways that would have destroyed things
    // silently, because step 3.2 drops the original table and anything the
    // file does not name goes with it: it recreated three triggers where
    // production carries six, and named sixteen inbound FKs where there are
    // seventeen. The worst of the three was `audit_orders` from 169 (applied
    // 09-04), so the file would have removed the audit trail from orders
    // with no error anywhere. All four gaps are closed in the file, and
    // `preflight_184.sql` re-checks both lists against live catalogs at
    // window time, because every migration landing between now and then can
    // make it stale again the same way.
    //
    // 185 APPLIED 2026-09-09. It REWRITES existing policies from texts it
    // quotes, the shape that nearly broke 183, so all six were read off
    // production first: all six matched verbatim, roles included, so the
    // 09-04 measurement was still current. Blast radius measured as zero
    // before applying (no soft-deleted products, no inactive categories,
    // reviews and wishlists empty). The four names then moved from
    // SOFT_DELETE_PENDING_TABLES into SOFT_DELETE_LIVE_TABLES, which is the
    // application half of the same change.
    //
    // Its documented wishlist restore does NOT work: Postgres applies SELECT
    // policies to the rows an UPDATE ... WHERE reads, so the filtered SELECT
    // policy hides the row before the unfiltered UPDATE policy is consulted
    // (measured: 0 rows restored, 1 with an unfiltered SELECT policy, all
    // else equal). Nothing writes wishlists yet, so the claim was corrected
    // rather than the policy redesigned; held by
    // wishlist-soft-delete-restore.test.ts.
    //
    // 173 APPLIED 2026-09-09, after two guards its own header claimed it had
    // were added to the file first. Its order trigger fires on `paid`, which
    // finalize sets after the card is charged, and it shipped with no
    // EXCEPTION clause: proven on two paid orders with the enqueue forced to
    // fail, the guarded version let the UPDATE through and the unguarded one
    // rolled it back and left the order `paid`. And `fn_enqueue_whatsapp`
    // shipped EXECUTE-able by PUBLIC, so `SET ROLE anon` plus one call planted
    // a whatsapp_outbox row for an opted-in customer with an attacker-chosen
    // payload. 095's fn_enqueue_notification already had the grants 173 was
    // missing. Both fixes are pinned in whatsapp-migration-guards.test.ts.
    //
    // 177 / 178 / 179 APPLIED 2026-09-09 as one batch, because all three only
    // ever CREATE and none of them touched an object that already existed.
    // The measurement that mattered was the one 183 taught: all three restate
    // `set_updated_at` with CREATE OR REPLACE, so the live body was read with
    // pg_get_functiondef first and found byte-identical -- a replace that
    // changes nothing, rather than a silent edit to every table using it.
    // Two of 177's assumptions about existing objects were also read rather
    // than believed: `wallet_accounts` has no `owner_type` column (so both of
    // its branches take the ELSE path) and `wallet_entries.reason` carries no
    // CHECK constraint (so `cashback_bonus` is accepted -- a reason list would
    // have been 183's 23514 one table over). Proven in rolled-back
    // transactions: rank 1 paid exactly 10% (8170 of 81700 agorot), rank 5
    // exactly 5%, replay returned 0, and UPDATE and DELETE were both refused
    // by the append-only trigger.
    //
    // 183 APPLIED 2026-09-09, and its preflight is the argument for having
    // one. The file restated `notification_outbox_kind_check` in full, the
    // way 121 does, from a twelve-name list. The LIVE constraint already
    // carried fourteen: `account_deleted` (150) and `order_shipped` itself.
    // Applying it verbatim would have DROPPED `account_deleted` and turned
    // every account-deletion notification into a 23514. A restated list is
    // only as current as the day it was written.
    //
    // 181 APPLIED 2026-09-09 and split in two on the way in, the shape
    // production already recorded for 135: `181a_read_only_enum` carries the
    // `ALTER TYPE ... ADD VALUE` alone so nothing can reference the new member
    // in the transaction that adds it, and `181b_admin_rbac_hardening` carries
    // everything that uses it. Splitting also gives the pair a safe stopping
    // point, which matters because an enum member is permanent: 181a on its own
    // is inert, referenced by no policy and no function until 181b lands.
    //
    // 184 and 185 were 148 and 149 until 2026-09-09. Production had already
    // spent both numbers on different migrations (148_refund_destination
    // 20260902182227, 149_audit_log_append_only 20260902182235), so the
    // unapplied file is the one that moved.
    // 211 IS NOT APPLIED, measured 2026-09-09 while closing out the applied
    // batch around it: production has no `fn_wa_orders_for_phone` and
    // schema_migrations has no 211 row, so the file stays here. The webhook
    // already degrades without it (intent falls back to `message`, status
    // questions file a ticket), which is why nothing forced the apply.
    // 223 IS applied (2026-09-09, `restock_on_refund_223`) and stays filed
    // here as the record, the same way 217 does. It skips 218-222 because
    // those numbers are taken by pending files on `audit/final-audit`.
    // 224 IS applied (2026-09-10, `post059_price_cashback_twins_224`): the
    // generated agorot twins under the post-059 names `cashback_applied_agorot`
    // and `unit_price_agorot`, filed here as the record like 217 and 223.
    // 226 IS applied (2026-09-10, `fraud_controls_226`): the two server-only
    // fraud tables (fraud_flags, fraud_review_queue), proven first in a
    // rolled-back DO block and filed here as the record like 217/223/224.
    // Numbered 226 because 225 is taken by a pending file on another branch.
    // 227 IS applied (2026-09-10, `discount_claim_wiring_227`): replay-first
    // claim_order_discount, the expired-order discount sweep and the
    // stranded-payment consume, proven first in a rolled-back DO block and
    // filed here as the record like 217/223/224/226.
    // 228 IS applied (2026-09-10, `invoice_sequences_228`): the platform's
    // own sequential invoice numbering (invoice_counters,
    // fn_next_invoice_number, invoices.series/internal_number), proven first
    // in a rolled-back DO block (1,2,3 on one series, 1 on another, ACL
    // service_role only) and filed here as the record like 217/223/224/226/227.
    // 231 IS applied (2026-09-10, `bell_fanout_231`): the in-app bell's
    // writer, an AFTER INSERT trigger on notification_outbox composing the
    // customer's Hebrew into 198's notifications table. Proven first in a
    // rolled-back DO block over production (five kinds exercised; the probe
    // caught array_to_string's ''-not-NULL trap before apply), then the
    // realtime delivery proven live end to end by
    // scripts/verify-bell-realtime.mjs (INSERT + UPDATE both received, probe
    // artifacts removed). Numbered 231 because 229/230 are taken by pending
    // files on other branches, the same reason 226 skipped 225. Filed here
    // as the record like 217/223/224/226/227/228.
    // 232 IS applied (2026-09-10, `reviews_admin_moderation_only_232`):
    // reviews closed to owner-plus-admin -- 199's supplier-reply column
    // UPDATE grant and policy gone, 154's public read of approved rows gone,
    // anon SELECT revoked. Both holes proven live in rolled-back
    // transactions before apply (anon could SELECT, authenticated could
    // UPDATE supplier_reply), both 42501 after, owner-scoped SELECT still
    // passing. Numbered 232 because 229/230 are taken by pending files on
    // other branches. Shape pinned in
    // reviews-moderation-migration-guards.test.ts; filed here as the record
    // like 217/223/224/226/227/228/231.
    // 233 IS applied (2026-09-10, `wishlist_alerts_233`, version
    // 20260910025004): the wishlist alert prefs and the last-seen stock
    // flags behind /api/cron/wishlist-alerts. Proven first in a rolled-back
    // transaction with functional probes (defaults, the unsubscribe upsert,
    // authenticated locked out of the state table) and filed here as the
    // record like 217/223/224/226/227/228/231/232.
    // 234 IS applied (2026-09-10, `gift_cards_234`): the gift_cards table,
    // products.is_gift_card, the gift_card_issued outbox kind and
    // redeem_gift_card. Verified object-by-object against production after
    // the fact (table, flag column, all five indexes including the partial
    // issue dedupe, the RLS policy and the widened kind check all present,
    // zero rows) and filed here as the record like 217/223/224/226-233.
    expect(sqlFilesIn(PENDING_DIR)).toEqual([
      '162_cron_schedule.sql',
      '184_orders_monthly_partitioning.sql',
      '211_whatsapp_selfservice.sql',
      '217_coupon_qr_redemption.sql',
      '223_restock_on_refund.sql',
      '224_post059_price_cashback_twins.sql',
      '226_fraud_controls.sql',
      '227_discount_claim_wiring.sql',
      '228_invoice_sequences.sql',
      '231_bell_fanout.sql',
      '232_reviews_admin_moderation_only.sql',
      '233_wishlist_alerts.sql',
      '234_gift_cards.sql',
      'preflight_162.sql',
      'preflight_184.sql',
    ])
  })

  it('keeps the cancelled revoke where nobody will apply it', () => {
    // A cancelled migration is not deleted: the number stays burned and the
    // file is the only written record of WHY the revoke must not happen.
    expect(sqlFilesIn(CANCELLED_DIR)).toEqual(['165_revoke_anon_helpers.sql', 'preflight_165.sql'])
  })

  // ---- direction 2: manifest -> disk -------------------------------------
  it('names no file that is not on disk', () => {
    const present = new Set([
      ...sqlFilesIn(PENDING_DIR),
      ...sqlFilesIn(APPLIED_DIR),
      ...sqlFilesIn(CANCELLED_DIR),
      ...sqlFilesIn(SUPABASE_DIR),
    ])
    const missing = manifestFilenames().filter((name) => !present.has(name))
    expect(
      missing,
      `README.md names these, which exist in neither directory: ${missing.join(', ')}`,
    ).toEqual([])
  })

  // ---- the split location must not come back -----------------------------
  it('leaves no PENDING- file in the applied-migrations directory', () => {
    // The three that lived there were moved into migrations/pending/ and
    // renumbered on 01.09. `supabase/migrations/` is applied migrations only,
    // and a reader who checks one directory must not be missing a third of the
    // pending work.
    expect(sqlFilesIn(SUPABASE_DIR, (n) => n.startsWith('PENDING-'))).toEqual([])
  })

  // ---- numbering ---------------------------------------------------------
  it('repeats no migration number across the two directories', () => {
    const historical = new Set(numbersOf(SUPABASE_DIR))
    const clash = [...new Set([...numbersOf(PENDING_DIR), ...numbersOf(APPLIED_DIR)])].filter((n) =>
      historical.has(n),
    )

    expect(
      clash,
      `these numbers mean two different things in the two directories: ${clash.join(', ')}`,
    ).toEqual([])
  })

  // ---- the tangle this file did not catch --------------------------------
  it('lets no unapplied migration squat on a number production has spent', () => {
    // MEASURED 2026-09-09. `pending/` held TWO 170s and TWO 171s, written by
    // sessions that could not see each other, while production had already
    // applied one of each pair (`reporting_tables_170` 20260904003703,
    // `search_fts_171` 20260904005239). It also held a 148 and a 149 whose
    // numbers production spent back on 2026-09-02. Nothing was red: the only
    // numbering assertion here compared pending+applied against
    // `supabase/migrations/`, so a collision INSIDE the pair of directories
    // this file is named after went unseen for five days.
    //
    // The asymmetry is the whole point. A duplicate number inside `applied/`
    // is history and cannot be undone -- production really did spend 169 and
    // 172 twice, and both members of each pair are recorded above. A number
    // shared between `pending/` and `applied/` is different: it means a file
    // nobody has run is wearing a number that already means something in the
    // database, so "apply 170" is an ambiguous instruction at the one moment
    // ambiguity is most expensive. The unapplied file is the one that moves;
    // 148/149/170/171 became 184/185/186/187 on the day this test was written.
    const spent = new Set(numbersOf(APPLIED_DIR))
    const squatting = sqlFilesIn(PENDING_DIR).filter((n) => spent.has(n.slice(0, 3)))

    expect(
      squatting,
      `these unapplied files carry a number already applied to production: ${squatting.join(', ')}`,
    ).toEqual([])
  })

  it('places the code-first revoke last and names the commit it needs', () => {
    // 145 revokes `check_rate_limit` from anon. Applied before the build that
    // moved the limiter onto the service-role client is live, the RPC returns
    // 42501 to a still-anon caller, the fail-open branch swallows it, and every
    // rate limit in the app turns off silently. The manifest has to carry both
    // the ordering and the commit, or the next reader cannot check it.
    const text = readmeText()
    expect(text).toContain('CODE-FIRST')
    expect(text).toContain('d5c2739d4')
    expect(text.trimEnd()).toMatch(/145\b/)
  })
})
