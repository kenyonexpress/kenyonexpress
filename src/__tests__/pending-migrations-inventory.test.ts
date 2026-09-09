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
    // 188 ADDED 2026-09-09, unapplied and low-stakes. It pins `search_path` on
    // the three functions Supabase's `function_search_path_mutable` lint
    // reports. All three are SECURITY INVOKER, so the mutable path is not the
    // escalation the lint name suggests: an INVOKER body runs as the caller and
    // resolves names with the caller's own path. It is here so the number of
    // unpinned functions can be zero rather than three-with-a-paragraph. Probed
    // for what it creates the same way as the two above: `proconfig` on all
    // three is `(none)` in production.
    expect(sqlFilesIn(PENDING_DIR)).toEqual([
      '162_cron_schedule.sql',
      '184_orders_monthly_partitioning.sql',
      '188_pin_invoker_search_path.sql',
      // 189 WRITTEN 2026-09-09, not applied. Additive only: two ADD COLUMN and
      // one partial UNIQUE INDEX on reviews. Its DDL, its refusal guard and the
      // constraint it creates were each proven against production in
      // transactions that were rolled back -- see the file header. It has no
      // preflight because it drops nothing and rewrites no policy, so there is
      // no live catalog it can go stale against; the one thing that CAN change
      // under it (a duplicate appearing before it is applied) is what block 0
      // reads at apply time.
      '189_reviews_title_and_one_per_product.sql',
      // 190 WRITTEN 2026-09-09, not applied. One destructive statement -- the
      // function is DROPped because its return type gains a column -- and that
      // is why it carries explicit REVOKEs: measured on production, a bare
      // CREATE hands EXECUTE on a SECURITY DEFINER function that returns
      // customer emails to PUBLIC, anon and authenticated, undoing a revoke
      // somebody had already made. Also proven: the old uniqueness is a
      // CONSTRAINT, not a bare index, so `DROP INDEX` on it fails 2BP01.
      '190_abandoned_cart_second_reminder.sql',
      // 191 WRITTEN 2026-09-09, not applied. Purely additive: one new table,
      // one new function, nothing existing touched. It gives the terminal
      // reconciliation cron somewhere to put its findings, which SECTIONS 28
      // names and which existed nowhere. Verified against production inside a
      // rolled-back DO block: the re-find path bumps `seen_count` and preserves
      // `first_seen_at`, a batch carrying the same key twice writes one row,
      // and the same deal number on a second terminal is a second finding.
      // The route runs unchanged without it, reading PGRST202 and 42883 as
      // "not applied yet".
      '191_payment_discrepancies.sql',
      // 192 WRITTEN 2026-09-09, not applied, and the only DATA-only file in
      // this list. `public.seo_redirects` holds 0 rows in production, so every
      // URL the retired WordPress site served 404s today; this is the 33-row
      // map that fills it. Generated, not hand-written:
      // `node scripts/build-legacy-redirects.mjs --check` fails on any edit to
      // either the SQL or the JSON it came from. It is not the projection
      // `wp_import.fn_project_redirects` would write -- that one emits 34 rows
      // of which 13 are wrong against production today, including a 410 on the
      // live /blog route. Idempotent, deactivates rather than deletes so the
      // hit counter survives, and raises unless exactly 33 rows end up active.
      '192_seed_seo_redirects.sql',
      // 193 WRITTEN 2026-09-09, not applied. It creates the record that makes a
      // struck-through "before" price checkable, and the measurement that
      // motivates it is a disjoint pair of sets: 15 active products advertise a
      // saving, 20 have any price change recorded in `audit_log`, and NO
      // product is in both. There is no evidence anywhere that any of the
      // fifteen struck-through prices was ever charged. Append-only by trigger
      // for every role including service_role, because a history that whoever
      // is running the sale can edit is a second copy of the claim rather than
      // evidence of it. Verified against production inside a rolled-back DO
      // block: 80 rows seeded, a second identical run wrote 0, UPDATE and
      // DELETE both refused, and no product skipped for want of a price.
      '193_price_history.sql',
      // 194 WRITTEN 2026-09-09, not applied. It makes `max_uses` and
      // `max_uses_per_user` mean something. checkout.ts already carried the
      // finding in a comment -- "nothing increments coupons.used_count, so
      // max_uses is enforced as a read of a counter no part of this flow
      // advances" -- which is to say a single-use code was unlimited-use, for
      // everybody, and the check passed every time. `discount_campaigns` has
      // the same defect behind a schema that looks complete. Shaped after 117's
      // stock reservation deliberately: claim under FOR UPDATE before the
      // charge, release where the stock is released. Proven against production
      // in a rolled-back DO block -- a replay for the same order leaves
      // used_count at 1 and writes one row, a second order for the same user
      // returns per_user_exhausted, and release hands the use back.
      '194_discount_claim_caps.sql',
      // 195 WRITTEN 2026-09-09, not applied, and the smallest file here on
      // purpose. A sold-out product page printed "אזל מהמלאי", disabled the
      // button, and learned nothing from the visit. Measured the same day: no
      // active product is at zero stock (44 active, 0 sold out, 19 untracked
      // and therefore never sold out by construction), so this is built for the
      // first time that branch is reached rather than to stop something
      // bleeding. Proven against production in a rolled-back DO block: two
      // calls with the same address in different casing write one row, a
      // malformed address and an unknown product are both refused, and a person
      // already notified can ask again for the next restock.
      '195_stock_waitlist.sql',
      // 196 WRITTEN 2026-09-09, not applied. One key in one jsonb_build_object.
      // The chain it completes: 155 gave order_items a carrier and a tracking
      // number (applied), the admin records them, 183 mails the customer
      // "ההזמנה שלך נשלחה" with a button reading "למעקב אחרי ההזמנה" -- and the
      // page that button points at rendered the word "נשלח" and nothing else.
      // The number was captured, stored, and shown to nobody. `shipments` is an
      // ARRAY because carrier and tracking are per LINE, which is 155's own
      // decision for the multi-supplier order this platform treats as normal.
      // Proven against production in a rolled-back DO block: the trigger fired
      // once and the payload carried exactly the line with a real number, the
      // one whose tracking was whitespace excluded.
      '196_shipped_notification_carries_tracking.sql',
      // 197 WRITTEN 2026-09-09, not applied, and it changes nothing a customer
      // sees on purpose. Nothing charges for delivery anywhere today, and that
      // is a decision rather than a gap: TopBar prints "משלוח מהיר חינם" on
      // every page. What is missing is a PLACE to put a rate -- "free" is
      // currently expressed as an absence, and an absence cannot be changed
      // carefully. Seeded with exactly today's policy. `pickup_points` is
      // created EMPTY: a pickup point is an arrangement with a real shop, and a
      // seeded fake sends a customer to a locked door. Proven in a rolled-back
      // DO block: 5 zones, none charging, no pickup rows, anon INSERT refused.
      '197_shipping_zones_and_pickup.sql',
      // 198 WRITTEN 2026-09-09, not applied. The bell, and the settings behind
      // it. `notification_outbox` is an EMAIL QUEUE -- a record of what we tried
      // to SEND, not of what a customer has been TOLD -- so it cannot back an
      // unread count without an "unread" that clears when a cron runs. The
      // ALTER PUBLICATION at the bottom is part of the feature, not
      // housekeeping: `supabase_realtime` contains ZERO tables (measured), and
      // a postgres_changes subscription against a table outside it connects,
      // reports SUBSCRIBED and receives nothing, with no error on either side.
      // Proven against production in a rolled-back DO block: the table joined
      // the publication, an absolute href was refused by the CHECK, the owning
      // customer could mark read but NOT rewrite a title (the column grant),
      // and another user's rows were invisible.
      '198_in_app_notifications.sql',
      // 199 WRITTEN 2026-09-09, not applied, and the REVOKE in it is the whole
      // point rather than tidying. `authenticated` already held a TABLE-WIDE
      // UPDATE grant on `reviews`, inert only because no UPDATE policy existed.
      // Adding the supplier reply policy would have made it live: the first
      // version of the file was probed against production and came back
      // `rewrite_body=ALLOWED`, meaning a supplier could have rewritten the
      // rating and body of a review about their own business. Re-probed after
      // the revoke: update_grants=3, own_reply=ALLOWED, rewrite_body=REFUSED,
      // another supplier's review NO ROWS, a duplicate report REFUSED, and a
      // reporter reading the queue REFUSED.
      '199_review_replies_and_reports.sql',
      // 200 WRITTEN 2026-09-09, not applied. Two `kind` values so a wishlist
      // can be worth having: a saved product that got cheaper, and one that
      // came back into stock. Both are possible because the DATA arrived in
      // 193 and 195, not because anything new is invented here.
      //
      // The constraint cannot be extended, only dropped and recreated, which is
      // exactly what 183 nearly got wrong: it restated twelve names
      // reconstructed from an earlier file while the live constraint carried
      // fourteen, and applying it would have DROPPED `account_deleted`. The
      // fourteen restated here were read out of production with
      // pg_get_constraintdef, and the DO block at the top REFUSES to run if the
      // live constraint has grown a name this file does not know -- a migration
      // that restates a list is only as current as the day it was written, so
      // it checks the day it runs. Probed against production, rolled back:
      // guard=PASSED, kinds=16, price_drop accepted, a bogus kind still
      // refused, account_deleted kept.
      '200_wishlist_alert_kinds.sql',
      // 201 WRITTEN 2026-09-09, not applied. Flash deals: a price change with a
      // time on it. `discount_campaigns` (096) schedules a CODE; nothing has
      // ever scheduled a PRICE, so the only way to run one was an operator
      // editing kenyon_price twice and remembering to come back.
      //
      // The interesting property is what it does NOT need to do. A scheduler
      // that moves prices on a timer, over a catalogue where 15 of 44 products
      // advertise an unevidenced struck-through price, reads like a machine for
      // manufacturing non-compliant discounts -- and is not, because 193
      // governs the CLAIM rather than the price. Its whole duty to compliance
      // is that every applied change writes a price_history row with
      // source='change', the column 193 created for this and left unused,
      // closing the sampling gap 193 documented: until now the record was one
      // observation a day at 04:00, so a deal from 10:00 to 18:00 left no
      // trace. Probed against production, rolled back: a duplicate moment
      // REFUSED, a negative price REFUSED, a past-due row still due, a
      // cancelled row freeing its slot, and anon unable to read the schedule.
      '201_scheduled_price_changes.sql',
      // 202 WRITTEN 2026-09-09, not applied. Fraud and abuse: three tables and
      // one column that is a live bug.
      //
      // THE COLUMN IS NOT A FEATURE. `information_schema` says public.payments
      // has twenty columns and `token_id` is not one of them, although
      // 026_commerce.sql declares it in the CREATE TABLE. On 2026-09-07 commit
      // 52fe21ed4 added `token_id` to the payments INSERT on the saved-card
      // path, so 42703 took down the whole statement and EVERY saved-card
      // purchase failed before Cardcom was called. The application no longer
      // needs this migration for that -- `payment-token-column.ts` probes and
      // omits -- so applying it restores the record, not the sale.
      //
      // The refusing half of the layer (velocity: declines, distinct cards, one
      // card across accounts) reads tables production already has and needs
      // NOTHING here. What needs applying is the recording: risk assessments in
      // their own table rather than a column on `orders`, whose INSERT must not
      // grow; refund_requests with a cap of three PER ORDER enforced by a
      // trigger, counting withdrawn rows so the cap cannot be bypassed by
      // withdraw-and-reopen; and disputes, entered by hand because the legacy
      // Cardcom API sends no chargeback notification, with a NOT NULL
      // `respond_by` because a case answered late is lost by default.
      //
      // `status` is text+CHECK and not `public.dispute_status`, which exists in
      // production with zero columns using it: that enum cannot distinguish
      // losing a chargeback from choosing not to contest one.
      //
      // Probed against production, rolled back: the review CHECK refuses half a
      // decision, three requests land and the FOURTH is refused, a withdrawal
      // does NOT free a slot, an approval with no decided_at is refused, a
      // duplicate provider_ref is refused, and a `won` with no resolved_at is
      // refused. pg_class, pg_proc and information_schema re-read afterwards:
      // nothing left behind.
      '202_fraud_abuse.sql',
      // 203 WRITTEN 2026-09-09, not applied. The support tables are ALREADY
      // live -- `support_tickets` and `support_ticket_messages`, RLS on, five
      // policies, zero rows -- so this is what they are missing rather than a
      // new feature's schema.
      //
      // The finding is in the CHECK constraint: `channel` has always permitted
      // 'contact_form' and NOTHING HAS EVER WRITTEN IT. The contact form sends
      // mail and creates no ticket, so a customer's message lived in an inbox
      // with no status, no owner and no record that anybody answered.
      //
      // `email` is a bug fix, not a feature: a contact_form ticket has no
      // user_id and no phone, so the table could hold a message from somebody
      // we had no way to reply to. A CHECK now requires one of the three.
      //
      // The policy change is a LEAK FIX. `internal` becomes an expressible
      // direction, and the existing owner-read policy returns every message on
      // the ticket -- so the first internal note would have been handed to the
      // customer it was written about. The new policy filters it in the same
      // statement that introduces the direction.
      //
      // No SLA due-date column, deliberately: a stored deadline is computed
      // under a policy that was not stored beside it, so it cannot be
      // recomputed when the targets move. Derived in sla.ts instead. The
      // contrast is disputes.respond_by (202), which IS stored because somebody
      // else set it.
      //
      // Probed against production, rolled back: an unreachable ticket REFUSED,
      // the new channels and categories accepted, `closed` without closed_at
      // REFUSED and closed_at without `closed` REFUSED, a bogus priority and a
      // bogus category REFUSED, the `internal` direction accepted and a bogus
      // one REFUSED, and the owner policy confirmed to filter internal notes.
      '203_support_center.sql',
      // 204 WRITTEN 2026-09-09, not applied. Supplier onboarding as a thing
      // separate from being a supplier.
      //
      // THE OBVIOUS DESIGN IS ONE ENUM VALUE AND IT IS WRONG. `supplier_status`
      // is active/suspended/closed, and adding `pending` looks like one line --
      // but `from('suppliers')` appears at 19 call sites here and roughly nine
      // filter on status at all, so a pending supplier would be VISIBLE BY
      // DEFAULT in about ten places, with nothing failing if one were missed.
      // A separate application table inverts that: an applicant is not a
      // supplier and cannot appear where suppliers appear, because there is no
      // row. The `suppliers` row is created at approval, by which point every
      // existing query is already correct. The 12 live supplier rows are
      // untouched.
      //
      // The bank account is NOT a column: `supabase_vault` is installed here
      // (measured, and a create/read round trip exercised and rolled back), so
      // the number goes into a vault secret through a SECURITY DEFINER wrapper
      // granted to nobody but the service role, and the row keeps the uuid plus
      // the bank code, branch and last four. There is deliberately NO read
      // function -- nothing in the app needs to turn the id back into an
      // account, and one sitting here unused is one that can be called.
      //
      // The contract log is append-only and stores a SHA-256 of the exact text:
      // "they accepted the terms" is worth nothing if the terms can be edited
      // afterwards.
      //
      // Probed against production, rolled back: the vault wrapper round trips
      // and REFUSES an empty secret, a five-digit business id REFUSED,
      // `submitted` with no submitted_at REFUSED, a rejection with no reason
      // REFUSED, an approval with no supplier REFUSED, a SECOND live
      // application for one business number REFUSED while a rejected one frees
      // the number, a duplicate r2_key REFUSED, and a non-hex contract hash
      // REFUSED.
      '204_supplier_onboarding.sql',
      // 205: content_pages + content_page_revisions, for [58].
      //
      // IT SEEDS NOTHING, which is the decision worth recording here. The text
      // of /about, /faq, /contact and /suppliers stays in TypeScript and is the
      // FLOOR the reads fall back to; a row is created the first time an
      // operator saves that page. Seeding it in SQL would be a second copy of
      // every paragraph, in a file applied once and never read again, and the
      // copy that drifts would be the one on screen. Applying this file
      // therefore changes nothing a visitor sees.
      //
      // Writes go through three SECURITY DEFINER functions rather than
      // PostgREST, because the page update and its revision row have to be one
      // transaction and the revision NUMBER has to be allocated under a row
      // lock. Rollback appends rather than deletes.
      //
      // Probed against production, rolled back: the first save is revision 1
      // and the second is 2 on the same row, published_at does NOT move on a
      // later edit or on unpublish, an empty published prose body REFUSED while
      // the same body as a draft is accepted, an faq page with no entries
      // REFUSED, a Hebrew slug REFUSED, a bound route under /page/ REFUSED, a
      // second page claiming /about REFUSED, a rollback of a revision that does
      // not exist REFUSED, an unknown status REFUSED, a 9-character meta
      // description REFUSED, a javascript: og image REFUSED, and anon saw the
      // one published row, no revisions, and could neither update a page nor
      // execute save_content_page.
      '205_content_pages.sql',
      // 206: four more homepage_sections kinds, and the window check 127 did
      // not have, for [59].
      //
      // 127 IS APPLIED AND BOTH ITS TABLES HOLD ZERO ROWS (read off production
      // 2026-09-09), so the machinery is live and inert: only the hero was ever
      // wired to it and no console existed. This file is the small database
      // half of [59]; the rest is application code.
      //
      // THE WINDOW CHECK IS A REAL DEFECT AND NOT A TIDY-UP. Neither table
      // checked that `ends_at` is after `starts_at`, and the live views filter
      // `starts_at <= now() AND ends_at >= now()` - so a backwards window, which
      // is one mis-typed `datetime-local` away on two adjacent fields, is a row
      // that is active, scheduled, correct-looking in the admin, and matches
      // NOTHING, EVER, with no error anywhere. Safe to add now precisely
      // because both tables are empty.
      //
      // Probed against production, rolled back: all four new kinds store and
      // 127's seven still store, an unknown kind REFUSED, a backwards window
      // REFUSED, a zero-length window REFUSED, an open-ended and a forward
      // window both accepted, a backwards banner window REFUSED, an array and a
      // string as `config` both REFUSED, the live view still hid a
      // future-windowed row while returning an open one, and anon could read
      // the live view and not insert.
      '206_homepage_merchandising.sql',
      // 207: the suppression list's missing half, and a grant fix, for [60].
      //
      // THE FIRST DRAFT OF THIS FILE WAS `CREATE TABLE email_suppressions
      // (address text ...)` AND WAS WRONG. Probed against production it failed
      // with `column "address" does not exist`, because `CREATE TABLE IF NOT
      // EXISTS` had silently done nothing: the table has been there since
      // `supabase/migrations/095_notification_outbox.sql` with `email` as its
      // primary key. A file that had been applied rather than probed would have
      // reported success and left every reader looking for a column that does
      // not exist.
      //
      // THE LIST IS ALREADY CONSULTED AND HAS NEVER HELD A ROW.
      // `fn_enqueue_notification` has checked it since 095 and pending 190
      // checks it too, and it is empty because Resend reports a bounce or a
      // complaint exactly once, over a webhook, and nothing listened.
      //
      // THE GRANTS ARE WIDER THAN THE POLICY: anon holds SELECT and
      // authenticated holds SELECT, INSERT, UPDATE, DELETE, TRUNCATE,
      // REFERENCES and TRIGGER against a single admin-SELECT policy. RLS closes
      // the DML, and TRUNCATE IS NOT SUBJECT TO RLS at all - it is unreachable
      // only because PostgREST has no endpoint for it. 144 swept this class and
      // did not reach this table.
      //
      // Probed against production, rolled back: a bounce suppresses and stores
      // normalised, a complaint OUTRANKS a bounce, a later `manual` does NOT
      // erase a complaint, one row per address however often reported, a
      // non-address REFUSED, an unknown reason REFUSED, an unnormalised address
      // REFUSED by the new CHECK, the 095 reader now finds the row, counters
      // increment rather than replace, an untagged send lands under `unknown`
      // rather than being dropped, an undefined event kind REFUSED, the grant
      // fix leaves authenticated with SELECT alone and anon with nothing, and
      // anon reached neither the counters nor suppress_email.
      '207_email_deliverability.sql',
      // 208: fourteen redundant indexes, for [62].
      //
      // 253 OF 390 INDEXES ARE UNUSED AND NONE OF THEM IS DROPPED FOR THAT.
      // At 44 rows Postgres will not use an index at all, so "never scanned"
      // mostly means "the query that would use it has never run". Dropping on
      // that basis optimises for a scale the business is trying to leave.
      //
      // Redundancy is the finding and it is wrong at every scale: an index on
      // (a) buys nothing beside one on (a, b), because a B-tree is scannable on
      // any prefix of its key.
      //
      // Probed against production, rolled back: all fifteen dropped with
      // enable_seqscan off so a 44-row table could not hide the answer, and
      // EXPLAIN re-read for each. products.status fell to idx_products_published
      // - the PARTIAL index, not the composite the pair-wise analysis predicted
      // - and carts, orders and vouchers each fell to their composite. The probe
      // also caught a defect in ITSELF: its first run used gen_random_uuid(),
      // which is VOLATILE and makes an index scan impossible, and reported a
      // seq scan that looked like a schema problem.
      '208_drop_redundant_indexes.sql',
      // 209: the advisor warnings that can be fixed without changing who can
      // read what, for [63].
      //
      // IT DOES NOT REACH ZERO WARN AND SAYS SO. It clears
      // function_search_path_mutable (3) and auth_rls_initplan (6). It leaves
      // the 23 SECURITY DEFINER execute warnings, because is_admin() alone is
      // called by 93 RLS policies and an RLS expression is evaluated AS THE
      // CALLING ROLE - revoking EXECUTE stops those 93 policies working, and
      // SECURITY INVOKER is worse because these functions read `profiles`,
      // which is behind a policy that calls them. It also leaves the 19
      // multiple-permissive warnings, which are a rewrite of access control on
      // 19 tables including three money tables.
      //
      // Probed against production, rolled back: all three functions pinned,
      // fn_il_phone_digits still normalises '054-123-4567' and '+972 54
      // 1234567' and still refuses junk, all six policies survive, the push
      // policy is now an InitPlan, and the RESTRICTIVE super_admin MFA gate
      // kept BOTH its COALESCE-to-aal1 default and its aal2 requirement - a
      // coalesce lost in that rewrite turns "no aal claim means refuse" into
      // "unknown, allow".
      '209_advisor_warnings.sql',
      // 210: which product types the shop is currently selling, for [89].
      //
      // THE MEASUREMENT INVERTED THE DEFAULT. [89] puts coupons in phase 1 and
      // physical products in phase 2, off until the admin turns it on after ten
      // sales. Read off production: all 44 active products are `physical`, all
      // 15 coupons are DRAFTS, and there have been 2 sales. Shipping phase 1 as
      // written would hide 44 of 44 and leave an empty shop.
      //
      // So `phase` records the section's assignment as ADVICE and `is_enabled`
      // is the switch, seeded true for every type. Applying this file changes
      // nothing a shopper sees; the admin screen prints how many active
      // products a switch would hide before it is flipped.
      //
      // Probed against production, rolled back: four rows seeded and all
      // enabled, every product_type enum value has a row, a re-run of the seed
      // does NOT re-enable a type the operator disabled and does not overwrite
      // their note, enabled_at is set on the first enable and moves neither on
      // a re-enable nor on a disable, an unknown type RAISES rather than
      // silently updating nothing, an enabled row with no date REFUSED while a
      // disabled future type with no date is accepted (which is what 91 and 92
      // need), phase 3 REFUSED, and anon could read the table - which the
      // storefront filter needs - and could neither write it nor execute
      // set_phase_enabled.
      '210_product_phases.sql',
      // 211: an invoice for a cycle charge, and [90]'s phase switch, off.
      //
      // MOST OF [90] IS ALREADY BUILT. 135b is applied, MAX_CHARGE_ATTEMPTS is
      // 3, the charge cron and /account/subscriptions exist, and
      // `subscription_charges_one_per_cycle` makes a cycle payable exactly
      // once. What was missing: pause and resume (the STATUS existed since 135b
      // and NOTHING COULD SET IT), an invoice per charge, and an admin console.
      //
      // `invoices.order_id` becomes nullable because a cycle charge creates no
      // order, and that is a decision the cron states in its own header rather
      // than an oversight. A CHECK requires exactly one of order_id and
      // subscription_charge_id: an invoice for nothing is a tax document nobody
      // can trace, and one for both is two claims about the same money.
      //
      // Probed against production, rolled back: the phase switch goes off
      // WITHOUT clearing enabled_at, an invoice for a charge with no order is
      // storable, a SECOND invoice for one charge REFUSED, an invoice for
      // NEITHER refused, an invoice for BOTH refused, the existing order-only
      // shape still works, and deleting a charge takes its invoice with it. The
      // probe's first run also caught itself: it used billing_interval 'month'
      // and subscriptions_interval_known permits only monthly|yearly.
      '211_subscriptions_phase2.sql',
      // 212: the course subtype, its lessons, and who may watch them, for [91].
      //
      // TWO TRANSACTIONS, and the reason is measured: `ALTER TYPE ... ADD VALUE`
      // was probed inside a DO block and ACCEPTED - Postgres 17 permits it in a
      // transaction and it rolled back cleanly - but USING the value in the
      // transaction that added it is still forbidden.
      //
      // THE PROBE CORRECTED THE FILE TWICE, and both were RLS mistakes that
      // would have shipped as "courses are broken for anonymous visitors":
      //
      //   1. `REVOKE ALL ... FROM anon` on course_products and course_modules
      //      directly contradicted the public-read policies above it. A policy
      //      grants nothing, it only filters what a GRANT allows. The error
      //      surfaced as `permission denied for table course_modules` raised by
      //      a query against course_LESSONS, because the lesson policy's
      //      subquery reads modules.
      //   2. One policy `TO anon, authenticated` calling `has_course_access`
      //      failed for anon with `permission denied for function` - privileges
      //      are checked on the whole expression, not short-circuited past the
      //      `is_preview` branch. Split by role, which is what
      //      `120_split_public_select_policies_by_role.sql` already did here.
      //
      // Probed against production, rolled back: anon sees ONLY the preview
      // lesson and can still read the syllabus, an authenticated user with no
      // purchase sees only the preview, the buyer of a real paid order sees
      // both and has access, progress is readable and writable only by its
      // owner, an UNPAID order grants nothing (paid_at is the test, not
      // status), a subscription grants access, SURVIVES the first decline, and
      // stops once the three attempts are spent.
      '212_courses_phase2.sql',
      // 213: cabins, and an EXCLUDE constraint that makes double-booking
      // impossible rather than unlikely, for [92].
      //
      // Every other way of preventing a double booking is application code:
      // read the calendar, decide it is free, write the row. Two requests that
      // read before either writes both decide it is free. That race is what a
      // popular weekend IS.
      //
      // HOLIDAY DATES ARE A TABLE, NOT A CONSTANT. Jewish holidays follow a
      // lunisolar calendar and fall on different Gregorian dates every year;
      // hard-coding a list would be writing dates this file cannot verify, and
      // a wrong date is a wrong price on the busiest night of the year.
      //
      // Probed against production, rolled back: btree_gist is AVAILABLE and not
      // installed and installs cleanly, an overlapping booking is REFUSED with
      // exclusion_violation, an ADJACENT one is accepted (checkout morning is
      // the next arrival), a zero-night stay is REFUSED rather than slipping
      // past the constraint because an empty range overlaps nothing, a hold
      // with no expiry is REFUSED because it would block a weekend forever, an
      // expired hold still blocks UNTIL the sweep runs and then does not, a
      // cancellation frees its dates immediately, a range rate with no dates
      // and a second weekend price are both refused, the cancellation window
      // cannot be narrowed below the statutory floor, and anon can see THAT
      // dates are taken through the view while the bookings table itself is
      // unreadable.
      '213_cabins_phase2.sql',
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
