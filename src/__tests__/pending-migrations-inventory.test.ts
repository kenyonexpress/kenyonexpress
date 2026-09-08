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
function manifestFilenames(): string[] {
  // `\d{3}[a-z]?_` and not `\d{3}_`: a migration that has to be split keeps its
  // number and takes a letter, the way production recorded 135 as
  // `135a_product_type_recurring` and `135b_recurring_subscriptions`. The
  // stricter pattern silently skipped both, so the manifest looked complete
  // while naming neither, which is the exact failure this file exists to catch.
  return [...new Set(readmeText().match(/\d{3}[a-z]?_[\w-]+\.sql/g) ?? [])].sort()
}

describe('the pending migration inventory', () => {
  it('holds the applied migrations and nothing else', () => {
    // A new pending migration is a deliberate diff here, which is the point:
    // schema changes are the one category where a silent addition is expensive.
    // The list moved wholesale into `applied/` on 2026-09-03; the assertion is
    // still "these thirty-four and nothing else", now against that directory,
    // because the alternative -- deleting the list -- would drop the only
    // record of which numbers exist.
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
    // EIGHT pending migrations as of the 2026-09-07 closeout
    // (docs/MIGRATION-AUDIT-162-172.md), each with its preflight beside it (a
    // CLOSEOUT §5 requirement: no migration file without the execute_sql audit
    // that has to pass before it). 171 and 172 got theirs on 2026-09-07; the
    // pairing is now asserted below rather than only listed here.
    //
    //   162_cron_schedule.sql               approved (CLOSEOUT §7), blocked on vault
    //                                       seeding -- see "## חסמים לאופיר" in STATE.md
    //   169, 170, 171, 172                  audited against production, ready,
    //                                       awaiting approval
    //   173                                 written in the closeout split-engine
    //                                       audit; repairs the retired
    //                                       commission_percent column and the
    //                                       nineteen half-filled split pairs
    //   174                                 wallet top-ups. payments.order_id is
    //                                       NOT NULL and payment_kind has no
    //                                       top-up value, so a card top-up has
    //                                       nowhere to be recorded today
    //   175                                 the referral settings singleton. The
    //                                       engine is built and wired and every
    //                                       claim returns program_inactive,
    //                                       because the table holds no row

    //   176                                 verify_supplier_staff_pin DELETEs
    //                                       its rate-limit row on success, and
    //                                       the key is per caller, so one known
    //                                       PIN buys unlimited guesses at the
    //                                       others. Found by the Supabase audit
    //                                       queue item 5; active_staff is 0 in
    //                                       production, so it is unreachable
    //                                       today and must land before the
    //                                       first supplier onboards staff

    //   177                                 set_updated_at has no search_path
    //                                       and 52 triggers use it. Found by
    //                                       the advisor; round 1 of the audit
    //                                       missed it because it counted only
    //                                       SECURITY DEFINER functions
    //
    // 166, 167 and 168 were found ALREADY APPLIED by the 2026-09-04 audit
    // (schema_migrations versions 20260903232445/232455/232504, live
    // definitions matching the files) and moved with their preflights to
    // migrations/applied/. 164 stays unused; 165 was written under §8c and
    // CANCELLED under §13 (eighteen public-role RLS policies call the
    // helpers, so the revoke would 42501 every anonymous catalogue read) --
    // it burned its number and sits in migrations/cancelled/, asserted below.
    expect(sqlFilesIn(PENDING_DIR)).toEqual([
      '162_cron_schedule.sql',
      '169_analytics_server_event_names.sql',
      '170_composite_indexes_top_queries.sql',
      '171_category_name_shekel_order.sql',
      '172_hide_master_product_test_row.sql',
      '173_products_retired_commission_percent.sql',
      '174_wallet_topups.sql',
      '175_referral_program_settings.sql',
      '176_supplier_pin_rate_limit_per_staff.sql',
      '177_set_updated_at_search_path.sql',
      '178_carts_one_row_per_owner.sql',
      'preflight_162.sql',
      'preflight_169.sql',
      'preflight_170.sql',
      'preflight_171.sql',
      'preflight_172.sql',
      'preflight_173.sql',
      'preflight_174.sql',
      'preflight_175.sql',
      'preflight_176.sql',
      'preflight_177.sql',
      'preflight_178.sql',
    ])
  })

  it('gives every pending migration a preflight to run first', () => {
    // The list above is an inventory: it goes stale the moment a file lands
    // and says nothing about what the file is missing. This is the rule
    // itself, so a sixth pending migration written without its execute_sql
    // audit fails here the moment it is added, not at the next hand audit.
    const migrations = sqlFilesIn(PENDING_DIR, (n) => !n.startsWith('preflight_'))
    const preflights = new Set(sqlFilesIn(PENDING_DIR, (n) => n.startsWith('preflight_')))
    const unaudited = migrations.filter((name) => {
      const number = name.match(/^(\d+)_/)?.[1]
      return !number || !preflights.has(`preflight_${number}.sql`)
    })
    expect(
      unaudited,
      `these pending migrations have no preflight_<n>.sql beside them: ${unaudited.join(', ')}`,
    ).toEqual([])
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
    const numbersOf = (dir: string) =>
      sqlFilesIn(dir)
        .map((n) => n.slice(0, 3))
        .filter((n) => /^\d{3}$/.test(n))

    const historical = new Set(numbersOf(SUPABASE_DIR))
    const clash = [...new Set([...numbersOf(PENDING_DIR), ...numbersOf(APPLIED_DIR)])].filter((n) =>
      historical.has(n),
    )

    expect(
      clash,
      `these numbers mean two different things in the two directories: ${clash.join(', ')}`,
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
