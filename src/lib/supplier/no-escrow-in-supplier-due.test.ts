import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { supplierDueAgorot } from './dashboard'

/**
 * The coupon money model, pinned at the source level.
 *
 * THE RULE (Ofir, 2026-07-28, reversing C11 version b): a coupon's whole
 * prepayment is the platform's at the moment of payment. The supplier receives
 * nothing from us on a coupon -- they take till cash from the customer at the
 * counter, which never enters our ledger -- there is no hold, nothing is
 * released on a scan, and the voucher simply expires once scanned.
 *
 * WHY A SOURCE SCAN AND NOT ONLY A UNIT TEST. `supplierDueAgorot` has been
 * correct since 085, and two OTHER modules still computed supplier due
 * themselves and got a different answer:
 *
 *   src/server/queries/supplier.ts   supplierDueAgorot: immediate + held
 *   src/server/analytics/queries.ts  supplier_immediate + escrow_release
 *
 * Both were reachable with real data: production carries 2 escrow_holds rows
 * still `held` (both against coupon codes) and 2 order_items with non-zero
 * escrow_held_agorot and escrow_release_agorot. The first told a supplier they
 * were owed money that will never arrive; the second inflated supplier revenue
 * in analytics. A unit test on the shared function could not have caught
 * either, because neither called it.
 */
/**
 * The CALLERS. `dashboard.ts` is deliberately absent: it is where the rule is
 * defined and accumulated, so it is the one file allowed to state the
 * arithmetic. Every other module must ask it.
 */
const FILES = ['src/server/queries/supplier.ts', 'src/server/analytics/queries.ts']

function source(relative: string): string {
  return readFileSync(resolve(process.cwd(), relative), 'utf8')
}

/** Comments explain the abolished model at length; only real code counts. */
function codeOnly(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !line.trim().startsWith('//') && !line.trim().startsWith('*'))
    .join('\n')
}

describe('the supplier is never credited from escrow', () => {
  /**
   * The invariant is "one implementation", not "no escrow identifier appears in
   * a sum". A pattern hunting for `escrow_*` next to a `+` was tried first and
   * was worse than useless: the real regression read `immediate + held`, whose
   * operands are LOCAL ALIASES, so the scan came back clean on the exact line
   * it existed to catch. Requiring the call instead cannot be evaded by
   * renaming a variable.
   */
  it.each(FILES)('%s derives supplier due only by calling the shared function', (file) => {
    const lines = codeOnly(source(file)).split('\n')

    // Assignments only. A type declaration (`supplierDueAgorot: number`) states
    // no arithmetic and is not a second implementation.
    const assignments = lines.filter(
      (line) =>
        /\bsupplierDue\b\s*[:=](?!=)|supplierDueAgorot\s*:/.test(line) &&
        !/:\s*(number|string|boolean)\s*$/.test(line.trim()),
    )

    const offenders = assignments.filter((line) => !/supplierDueAgorot\s*\(/.test(line))

    expect(
      offenders,
      `supplier due computed inline in ${file}: ${offenders.map((l) => l.trim()).join(' | ')}`,
    ).toHaveLength(0)
  })

  it('is the single source of truth and ignores every escrow input', () => {
    // Whatever legacy columns a row carries, the answer is the immediate split.
    expect(supplierDueAgorot({ supplierImmediateAgorot: 9_000, escrowHeldAgorot: 3_600 })).toBe(
      9_000,
    )
    // A coupon line: platform keeps the prepayment, so the supplier is due 0
    // from us no matter how large the legacy hold was.
    expect(supplierDueAgorot({ supplierImmediateAgorot: 0, escrowHeldAgorot: 180_000 })).toBe(0)
  })

  it('never returns a negative, whatever a legacy row holds', () => {
    expect(supplierDueAgorot({ supplierImmediateAgorot: -500 })).toBe(0)
  })
})
