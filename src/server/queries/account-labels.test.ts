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
function reasonCodesEmittedByMoneyPath(): string[] {
  const files = [
    resolve(process.cwd(), 'src/server/payments/finalize.ts'),
    resolve(process.cwd(), 'src/server/actions/payments/refund.ts'),
  ]
  const codes: string[] = []
  for (const file of files) {
    const source = readFileSync(file, 'utf8')
    codes.push(...[...source.matchAll(/p_reason:\s*'([^']+)'/g)].map((m) => m[1] as string))
  }
  return [...new Set(codes)]
}

describe('wallet reason labels', () => {
  it('finds the reason codes in the money path', () => {
    const codes = reasonCodesEmittedByMoneyPath()
    expect(codes.length).toBeGreaterThan(0)
    expect(codes).toContain('order_refund')
  })

  it('has a Hebrew label for every reason the payment flow writes', () => {
    for (const code of reasonCodesEmittedByMoneyPath()) {
      expect(WALLET_REASON_LABELS, `missing Hebrew label for reason "${code}"`).toHaveProperty(code)
      expect(walletReasonLabel(code)).not.toBe(code)
    }
  })

  it('falls back to the raw code instead of showing a wrong label', () => {
    expect(walletReasonLabel('reason_that_does_not_exist')).toBe('reason_that_does_not_exist')
  })
})
