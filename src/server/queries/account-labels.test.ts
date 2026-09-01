import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { WALLET_REASON_LABELS, walletReasonLabel } from './account'

/**
 * Regression guard. The wallet page renders `reason` codes through
 * WALLET_REASON_LABELS, but the codes themselves are written by finalize.ts as
 * `p_reason` arguments to fn_wallet_transfer. The two drifted once already
 * (the map said `cashback` while the ledger stored `order_cashback`), which
 * would have shown raw codes to customers.
 *
 * This reads the actual source rather than restating the codes, so adding a new
 * p_reason without a Hebrew label fails the suite.
 */
function reasonCodesEmittedByFinalize(): string[] {
  const source = readFileSync(resolve(process.cwd(), 'src/server/payments/finalize.ts'), 'utf8')
  const codes = [...source.matchAll(/p_reason:\s*'([^']+)'/g)].map((m) => m[1])
  return [...new Set(codes.filter((c): c is string => typeof c === 'string'))]
}

function reasonCodesEmittedByRefund(): string[] {
  const source = readFileSync(resolve(process.cwd(), 'src/server/payments/refund.ts'), 'utf8')
  const match = source.match(/REFUND_WALLET_REASON = '([^']+)'/)
  return match?.[1] ? [match[1]] : []
}

describe('wallet reason labels', () => {
  it('finds the reason codes in finalize.ts', () => {
    const codes = reasonCodesEmittedByFinalize()
    expect(codes.length).toBeGreaterThan(0)
  })

  it('has a Hebrew label for every reason the payment flow writes', () => {
    for (const code of [...reasonCodesEmittedByFinalize(), ...reasonCodesEmittedByRefund()]) {
      expect(WALLET_REASON_LABELS, `missing Hebrew label for reason "${code}"`).toHaveProperty(code)
      expect(walletReasonLabel(code)).not.toBe(code)
    }
  })

  it('falls back to the raw code instead of showing a wrong label', () => {
    expect(walletReasonLabel('reason_that_does_not_exist')).toBe('reason_that_does_not_exist')
  })
})
