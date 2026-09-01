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
  it('holds the twenty-four renumbered files and nothing else', () => {
    // A new pending migration is a deliberate diff here, which is the point:
    // schema changes are the one category where a silent addition is expensive.
    expect(sqlFilesIn(PENDING_DIR)).toEqual([
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
    ])
  })

  // ---- direction 1: disk -> manifest -------------------------------------
  it('names every file that is on disk', () => {
    const named = new Set(manifestFilenames())
    const unlisted = sqlFilesIn(PENDING_DIR).filter((name) => !named.has(name))
    expect(
      unlisted,
      `these files are in ${PENDING_DIR} but have no row in README.md: ${unlisted.join(', ')}`,
    ).toEqual([])
  })

  // ---- direction 2: manifest -> disk -------------------------------------
  it('names no file that is not on disk', () => {
    const present = new Set([...sqlFilesIn(PENDING_DIR), ...sqlFilesIn(SUPABASE_DIR)])
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

    const applied = new Set(numbersOf(SUPABASE_DIR))
    const clash = [...new Set(numbersOf(PENDING_DIR))].filter((n) => applied.has(n))

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
