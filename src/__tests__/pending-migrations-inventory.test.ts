import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The two pending-migration directories, and the README that describes them.
 *
 * WHY THIS IS WORTH A TEST. This README is the only navigation anyone has
 * across unapplied schema changes, and it is read at the moment somebody is
 * about to change production. On 19.08 it named two files that do not exist:
 * `002-products-geo.sql`, whose columns are in production and whose file was
 * deleted afterwards, and `PENDING-revoke_anon_writes.sql`, a SECURITY
 * migration whose listing read as 'written, awaiting approval' when nothing had
 * been written at all. Both are the kind of error that survives indefinitely,
 * because a file list is exactly what a reader trusts instead of checking.
 *
 * WHAT IT DOES NOT DO. It does not check that a migration is correct, or that
 * it has not been applied. Only production can answer the second question and
 * this suite has no database. It checks the cheap thing that was actually
 * wrong: that the README and the directories agree about which files exist.
 */

const PENDING_DIR = 'migrations/pending'
const SUPABASE_DIR = 'supabase/migrations'

function readmeText(): string {
  return readFileSync(resolve(process.cwd(), PENDING_DIR, 'README.md'), 'utf8')
}

function sqlFilesIn(dir: string, filter: (name: string) => boolean): string[] {
  return readdirSync(resolve(process.cwd(), dir))
    .filter((name) => name.endsWith('.sql') && filter(name))
    .sort()
}

describe('the pending migration inventory', () => {
  it('has the ten files the README claims are unapplied', () => {
    // A new pending migration is a deliberate diff here, which is the point:
    // schema changes are the one category where a silent addition is expensive.
    expect(sqlFilesIn(PENDING_DIR, () => true)).toEqual([
      '003-products-whatsapp-enabled.sql',
      '004-expire-vouchers-drop-escrow.sql',
      '005-homepage-cms.sql',
      '007-order-transition-guard.sql',
      '120_payment_events.sql',
      '121_refunds.sql',
      '122_search_index_outbox.sql',
      '123_supplier_branches.sql',
      '124_order_items_delivered_at.sql',
      '125_revoke_unused_definer_execute.sql',
    ])
  })

  it('has exactly the PENDING- files the README tabulates', () => {
    expect(sqlFilesIn(SUPABASE_DIR, (n) => n.startsWith('PENDING-'))).toEqual([
      'PENDING-109-recurring-subscriptions.sql',
      'PENDING-110-supplier-coordinates.sql',
      'PENDING-money-integer-fix.sql',
    ])
  })

  it('names no .sql file that does not exist', () => {
    // The failure both corrections shared: a filename in prose with nothing
    // behind it. Every `NNN-name.sql` and `PENDING-name.sql` the README
    // mentions must be a real file in one of the two directories, UNLESS the
    // README is explicitly saying it is gone.
    const text = readmeText()
    const present = new Set([
      ...sqlFilesIn(PENDING_DIR, () => true),
      ...sqlFilesIn(SUPABASE_DIR, () => true),
    ])
    const mentioned = text.match(/[\w-]+\.sql/g) ?? []
    const missing = [...new Set(mentioned)].filter((name) => !present.has(name))

    // Files the README discusses precisely BECAUSE they are absent. Each needs
    // the README to still say so, so this cannot become a dumping ground.
    const knownAbsent: Record<string, string> = {
      '002-products-geo.sql': 'no longer exists',
      'PENDING-revoke_anon_writes.sql': 'does not exist either',
      '126_revoke_authenticated_dml.sql': 'not in this directory',
      'pending-migrations-inventory.test.ts': 'this file',
    }

    for (const name of missing) {
      const claim = knownAbsent[name]
      expect(
        claim,
        `README names ${name}, which is not in ${PENDING_DIR} or ${SUPABASE_DIR}. Either add the file or say in the README that it is gone.`,
      ).toBeDefined()
      expect(
        text,
        `README names the absent ${name} but no longer explains that it is absent.`,
      ).toContain(claim as string)
    }
  })
})
