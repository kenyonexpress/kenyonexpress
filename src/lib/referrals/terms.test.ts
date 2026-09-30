import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { CASHBACK_CREDIT_REASONS } from '@/lib/cashback/tracker'
import { WALLET_REASON_LABELS } from '@/server/queries/account'
import { describe, expect, it } from 'vitest'
import { REFERRAL_CASHBACK_AGOROT, REFERRAL_WALLET_REASON } from './terms'

/**
 * Three files have to agree for "₪20 of cashback per referral, expiring after
 * twelve months" to be true, and none of them imports the others:
 *
 *   1. migration 250 seeds what the programme pays;
 *   2. 098 pays it from the cashback reserve under `referral_bonus`;
 *   3. 215 sweeps every credit from that reserve after twelve months, and
 *      the TypeScript tracker that tells the customer when a credit lapses
 *      has to count the same reason the SQL counts.
 *
 * Each assertion reads the SQL rather than restating it.
 */

const root = process.cwd()
const seed = readFileSync(join(root, 'migrations/pending/250_referral_program_seed.sql'), 'utf8')
const program = readFileSync(join(root, 'supabase/migrations/098_referral_program.sql'), 'utf8')
const expiry = readFileSync(join(root, 'migrations/applied/215_cashback_expiry.sql'), 'utf8')

describe('the referral reward', () => {
  it('is twenty shekels in integer agorot', () => {
    expect(REFERRAL_CASHBACK_AGOROT).toBe(2000)
    expect(Number.isSafeInteger(REFERRAL_CASHBACK_AGOROT)).toBe(true)
  })

  it('is what migration 250 seeds as the referrer bonus, with the programme on', () => {
    // The VALUES tuple, column order as the INSERT names it:
    // (id, referrer_bonus_agorot, referred_bonus_agorot, min_order_agorot, ...)
    const values = seed.match(
      /VALUES\s*\(\s*true,\s*(\d+),\s*(\d+),\s*(\d+),\s*(\w+),\s*(\w+)\s*\)/,
    )
    expect(values, 'the seed tuple was not found').not.toBeNull()
    const [, referrer, referred, minOrder, manual, active] = values as RegExpMatchArray
    expect(Number(referrer)).toBe(REFERRAL_CASHBACK_AGOROT)
    expect(Number(referred)).toBe(0)
    // A friend's first order has to bring in more cash than the bonus costs.
    expect(Number(minOrder)).toBeGreaterThan(REFERRAL_CASHBACK_AGOROT)
    expect(manual).toBe('false')
    expect(active).toBe('true')
  })

  it('does not overwrite terms a person already entered', () => {
    expect(seed).toContain('ON CONFLICT (id) DO NOTHING')
  })

  it('never seeds the money as a decimal', () => {
    // The step says "20 ILS"; the column is integer agorot and the seed must
    // not carry `20` or `20.00` into it.
    expect(seed).not.toMatch(/VALUES\s*\(\s*true,\s*20[,.]/)
  })
})

describe('the referral bonus is cashback', () => {
  it('is paid from the cashback reserve under the reason the tracker knows', () => {
    const payout = program.slice(program.indexOf('-- Referrer.'))
    expect(payout).toContain(`'${REFERRAL_WALLET_REASON}'`)
    // The reserve is the debit side (first argument) of the transfer.
    expect(payout).toMatch(/fn_wallet_transfer\(\s*v_reserve,\s*v_acct/)
    expect(program).toContain("WHERE code = 'platform:cashback_reserve'")
  })

  it('is swept by 215 because the sweep keys on the reserve account, not the reason', () => {
    expect(expiry).toContain('ON we.credit_account = wa.id AND we.debit_account = v_reserve')
    expect(expiry).toContain("now() - interval '12 months'")
  })

  it('is counted by the tracker, so the wallet shows its expiry date', () => {
    expect(CASHBACK_CREDIT_REASONS.has(REFERRAL_WALLET_REASON)).toBe(true)
  })

  it('has a Hebrew label on the wallet ledger', () => {
    expect(WALLET_REASON_LABELS[REFERRAL_WALLET_REASON]).toBeTruthy()
    expect(WALLET_REASON_LABELS[REFERRAL_WALLET_REASON]).not.toBe(REFERRAL_WALLET_REASON)
  })
})
