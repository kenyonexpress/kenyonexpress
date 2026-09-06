import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { WALLET_REASON_LABELS, walletReasonLabel } from './account'

/**
 * Regression guard. The wallet page renders `reason` codes through
 * WALLET_REASON_LABELS, but the codes themselves are written by the money path
 * as `p_reason` arguments to fn_wallet_transfer. The two drifted twice:
 *
 *   2026-08  the map said `cashback` while the ledger stored `order_cashback`
 *   2026-09  the goodwill wallet refund emitted `refund_to_wallet` from
 *            refund-to-wallet.ts, and this test only read finalize.ts, so it
 *            passed while a customer's ledger row would have rendered the raw
 *            Latin code on an RTL page
 *
 * The second one is why the scan is now over ALL of `src` rather than over one
 * named file: the sweep is the fix, not the file.
 */
function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full))
    else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(full)
  }
  return out
}

/** Every `p_reason: '...'` literal anywhere in src, test files excluded. */
function reasonCodesEmittedBySource(): { code: string; file: string }[] {
  const found: { code: string; file: string }[] = []
  for (const file of sourceFiles(resolve(process.cwd(), 'src'))) {
    for (const match of readFileSync(file, 'utf8').matchAll(/p_reason:\s*'([^']+)'/g)) {
      const code = match[1]
      if (code) found.push({ code, file })
    }
  }
  return found
}

describe('wallet reason labels', () => {
  it('finds the reason codes in the source', () => {
    const codes = reasonCodesEmittedBySource()
    expect(codes.length).toBeGreaterThan(0)
    // More than one file emits one, which is the fact the old single-file scan
    // assumed away.
    expect(new Set(codes.map((c) => c.file)).size).toBeGreaterThan(1)
  })

  it('has a Hebrew label for every reason the payment flow writes', () => {
    const missing = reasonCodesEmittedBySource()
      .filter(({ code }) => !(code in WALLET_REASON_LABELS))
      .map(({ code, file }) => `${code} (emitted by ${file.replace(process.cwd(), '.')})`)
    expect(missing, 'these reasons would render as a raw Latin code on the wallet page').toEqual([])
    for (const { code } of reasonCodesEmittedBySource()) {
      expect(walletReasonLabel(code)).not.toBe(code)
    }
  })

  it('falls back to the raw code instead of showing a wrong label', () => {
    expect(walletReasonLabel('reason_that_does_not_exist')).toBe('reason_that_does_not_exist')
  })
})
