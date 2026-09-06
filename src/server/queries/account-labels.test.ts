import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { WALLET_REASON_LABELS, walletReasonLabel } from './account'

/**
 * Regression guard. The wallet page renders `reason` codes through
 * WALLET_REASON_LABELS, but the codes themselves are written by the money path
 * as `p_reason` arguments to fn_wallet_transfer. That drifted three times:
 *
 *   2026-08  the map said `cashback` while the ledger stored `order_cashback`
 *   2026-09  the goodwill wallet refund emitted `refund_to_wallet` from
 *            refund-to-wallet.ts, and this test only read finalize.ts, so it
 *            passed while a customer's ledger row would have rendered the raw
 *            Latin code on an RTL page
 *   2026-09  TWO MORE were never in the map at all, because they are not
 *            emitted from TypeScript: `fn_pay_referral` writes
 *            `referral_bonus` and `credit_expired_vouchers` writes
 *            `voucher_expiry_credit`, both measured against production. The
 *            map's `coupon_expired` was a label for a code nothing emits.
 *            Those two are the credits a customer receives without buying
 *            anything, which is the worst place to show Latin script.
 *
 * So the scan is over BOTH sides now: every `p_reason:` literal in `src`, and
 * the reason argument of every `fn_wallet_transfer(...)` call in the checked-in
 * SQL. The sweep is the fix, not the file.
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

/**
 * The reason argument of a `fn_wallet_transfer(...)` call in SQL.
 *
 * The call is read with a PAREN-BALANCED scan rather than a regex, because the
 * amount argument routinely contains its own parentheses and its own comma
 * (`round(x::numeric / 100, 2)`), and a non-greedy regex stops at the first
 * `)` and captures nothing. Inside the balanced argument text the reason is the
 * first single-quoted literal: the three arguments before it are a debit
 * account, a credit account and an arithmetic expression, none of which is ever
 * a string literal in the live definitions.
 *
 * A GRANT on the function signature is balanced too and contains no literal, so
 * it contributes nothing rather than a false reason. The assertion below that
 * the two known database reasons ARE found is the tripwire against this whole
 * scan silently matching nothing.
 */
function balancedArgs(sql: string, openIndex: number): string {
  let depth = 0
  let quoted = false
  for (let i = openIndex; i < sql.length; i++) {
    const ch = sql[i]
    if (quoted) {
      if (ch === "'") quoted = false
      continue
    }
    if (ch === "'") quoted = true
    else if (ch === '(') depth++
    else if (ch === ')') {
      depth--
      if (depth === 0) return sql.slice(openIndex + 1, i)
    }
  }
  return ''
}

function reasonCodesEmittedBySql(): { code: string; file: string }[] {
  const found: { code: string; file: string }[] = []
  for (const root of ['supabase/migrations', 'migrations']) {
    const dir = resolve(process.cwd(), root)
    let files: string[]
    try {
      files = sqlFiles(dir)
    } catch {
      continue
    }
    for (const file of files) {
      const sql = readFileSync(file, 'utf8')
      const needle = /fn_wallet_transfer\s*\(/g
      for (const match of sql.matchAll(needle)) {
        const open = sql.indexOf('(', match.index ?? 0)
        if (open < 0) continue
        const code = balancedArgs(sql, open).match(/'([a-z_]+)'/)?.[1]
        if (code) found.push({ code, file })
      }
    }
  }
  return found
}

function sqlFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...sqlFiles(full))
    else if (entry.endsWith('.sql')) out.push(full)
  }
  return out
}

describe('wallet reason labels', () => {
  it('finds the reason codes the DATABASE writes, which no TypeScript emits', () => {
    const codes = new Set(reasonCodesEmittedBySql().map((c) => c.code))
    // Measured against production 2026-09-07: fn_pay_referral writes
    // referral_bonus and credit_expired_vouchers writes voucher_expiry_credit.
    expect(codes.has('referral_bonus')).toBe(true)
    expect(codes.has('voucher_expiry_credit')).toBe(true)
  })

  it('has a Hebrew label for every reason the database writes', () => {
    const missing = reasonCodesEmittedBySql()
      .filter(({ code }) => !(code in WALLET_REASON_LABELS))
      .map(({ code, file }) => `${code} (written by ${file.replace(process.cwd(), '.')})`)
    expect(
      [...new Set(missing)],
      'a wallet credit written by a database function would render as a raw Latin code',
    ).toEqual([])
  })

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
