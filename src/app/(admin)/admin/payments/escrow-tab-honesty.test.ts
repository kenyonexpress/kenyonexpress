import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * THE ADMIN VIEW WAS STILL PROMISING A RELEASE THAT WAS ABOLISHED.
 *
 * The escrow model was reversed on 2026-07-28 and migration 085 removed it from
 * the database. `src/server/queries/supplier.ts` was corrected then, and its
 * comment says why: adding the held amount "told a supplier they were owed
 * money that was never going to arrive". `src/app/(legal)/_content/terms.ts`
 * calls "escrow"/"נאמנות" the forbidden word and `legal-pages.test.ts` enforces
 * that in the customer copy.
 *
 * The admin payments page was not corrected. Measured against production on
 * 2026-09-08: `escrow_holds` holds two rows, both `held`, both against coupon
 * codes, created 2026-07-21 - seven days before the mechanism was abolished -
 * carrying 3600 agorot held and 3420 agorot in a column headed `לשחרור`, "to be
 * released". That is the same false sentence, told to the operator who would
 * have to answer the supplier asking about it.
 *
 * The rows are real ledger history and are NOT deleted. What changes is that
 * every label around them stops describing a future.
 */
const source = readFileSync(
  join(resolve(__dirname, '..', '..', '..', '..', '..'), 'src/app/(admin)/admin/payments/page.tsx'),
  'utf8',
)

describe('the historical holds tab does not promise a release', () => {
  it('does not head a column of real shekels with a bare future tense', () => {
    expect(source).not.toContain("header: 'לשחרור'")
  })

  it('marks the release column as the cancelled plan it is', () => {
    expect(source).toContain('תוכנן לשחרור (בוטל)')
  })

  it('does not label the tab as a live mechanism', () => {
    // "נאמנות (Escrow)" read as a current facility of the platform.
    expect(source).not.toContain("label: 'נאמנות (Escrow)'")
  })

  it('carries the date the mechanism was abolished, not a vague past', () => {
    expect(source).toContain('28.07.2026')
  })

  it('states plainly that nothing in the table will be released', () => {
    expect(source).toContain('לא ישוחרר')
  })

  it('still renders the rows, because they are ledger history', () => {
    // Deleting them would be a database deletion, which is a stop-and-ask, and
    // it would also destroy the only record of the abolished flow.
    expect(source).toContain("from('escrow_holds')")
  })
})
