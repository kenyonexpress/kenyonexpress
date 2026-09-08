import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { WITHDRAWAL_RULE } from './wallet-topup'

/**
 * "WALLET CASHBACK INTERNAL ONLY", AS AN ENFORCED ABSENCE.
 *
 * `WITHDRAWAL_RULE` states the property - not withdrawable, not transferable,
 * not convertible to cash - and `wallet-topup.test.ts` checks its flags are
 * false and that the terms page carries its notice. Both are worth having and
 * neither can catch the thing that would break the rule.
 *
 * You cannot enforce an absence with a value. If someone added
 * `withdrawFromWallet()` tomorrow, every existing assertion here would stay
 * green: the flags would still read false, the terms would still match, and the
 * money would still leave. The rule is declared and not checked.
 *
 * So this checks the shape of the ledger instead. `fn_wallet_transfer` is the
 * ONLY primitive that moves wallet money - a double-entry move between two
 * account ids - and there are exactly three call sites, each with an internal
 * counterparty:
 *
 *   finalize.ts        order_cashback     reserve  -> user
 *   finalize.ts        order_spend        user     -> platform
 *   refund-to-wallet   refund_to_wallet   house    -> user
 *
 * A fourth call site, a new reason, or a module that pairs a wallet move with a
 * provider payout are the three ways the property dies. Each fails here.
 */
const SRC = resolve(__dirname, '..', '..')

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) {
      walk(full, out)
      continue
    }
    if (/\.tsx?$/.test(full) && !/\.test\.tsx?$/.test(full)) out.push(full)
  }
  return out
}

const FILES = walk(SRC).map((f) => ({ path: relative(SRC, f), text: readFileSync(f, 'utf8') }))

/** Files that move wallet money, excluding the generated type surface. */
const movers = FILES.filter(
  (f) => f.text.includes("rpc('fn_wallet_transfer'") && f.path !== 'types/database.ts',
)

describe('the only primitive that moves wallet money has a known, closed set of callers', () => {
  it('is called from exactly the three known modules', () => {
    expect(movers.map((f) => f.path).sort()).toEqual([
      'server/actions/payments/refund-to-wallet.ts',
      'server/payments/finalize.ts',
    ])
  })

  it('every move states an internal reason', () => {
    const INTERNAL_REASONS = ['order_cashback', 'order_spend', 'refund_to_wallet']
    const reasons = movers
      .flatMap((f) => [...f.text.matchAll(/p_reason:\s*'([a-z_]+)'/g)].map((m) => m[1]))
      .sort()
    expect(reasons.length).toBeGreaterThan(0)
    for (const reason of reasons) expect(INTERNAL_REASONS).toContain(reason)
  })
})

describe('no wallet move sits in the same module as a way out to a card', () => {
  // The provider verbs that move real money. A module that can do both is one
  // edit away from a withdrawal, and the edit would look like plumbing.
  const PAYOUT_VERBS = ['refundByTransactionId', 'chargeWithToken', 'createLowProfile']

  for (const file of movers) {
    it(`${file.path} calls no provider payout verb`, () => {
      const found = PAYOUT_VERBS.filter((verb) => file.text.includes(`${verb}(`))
      expect(
        found,
        `${file.path} both moves wallet money and calls ${found.join(', ')}. Wallet balance is site credit; a module that can do both is where "internal only" stops being true.`,
      ).toEqual([])
    })
  }
})

describe('the declared rule and the enforced shape agree', () => {
  it('still declares the balance unwithdrawable', () => {
    expect(WITHDRAWAL_RULE.withdrawable).toBe(false)
    expect(WITHDRAWAL_RULE.convertibleToCash).toBe(false)
  })

  it('and no module names a withdrawal verb at all', () => {
    const offenders = FILES.filter((f) =>
      /\b(withdrawFromWallet|cashOutWallet|payoutWallet)\s*\(/.test(f.text),
    ).map((f) => f.path)
    expect(offenders).toEqual([])
  })
})
