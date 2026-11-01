import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { agorot } from '@/lib/money'
import { describe, expect, it } from 'vitest'
import { CASHBACK_LIFETIME_MONTHS, cashbackExpiresAt, expirableCashbackAgorot } from './expiry'

describe('expirableCashbackAgorot', () => {
  it('expires what is left of the old credits after every debit', () => {
    // 50.00 ILS earned 13 months ago, 20.00 ILS since spent: 30.00 lapses.
    // The same numbers the migration's rolled-back proof ran on production.
    expect(expirableCashbackAgorot(agorot(5000), agorot(2000), agorot(3000))).toBe(3000)
  })

  it('expires nothing when spending already consumed the old credits', () => {
    expect(expirableCashbackAgorot(agorot(5000), agorot(5000), agorot(0))).toBe(0)
    expect(expirableCashbackAgorot(agorot(5000), agorot(7000), agorot(100))).toBe(0)
  })

  it('never exceeds the live balance', () => {
    // Entries say 30.00 should lapse but the running balance only holds 10.00:
    // the smaller number is the one that cannot make the transfer raise.
    expect(expirableCashbackAgorot(agorot(5000), agorot(2000), agorot(1000))).toBe(1000)
  })

  it('treats a negative balance as nothing to expire', () => {
    expect(expirableCashbackAgorot(agorot(5000), agorot(0), agorot(-180))).toBe(0)
  })

  it('refuses negative sums', () => {
    expect(() => expirableCashbackAgorot(agorot(-1), agorot(0), agorot(0))).toThrow(RangeError)
    expect(() => expirableCashbackAgorot(agorot(0), agorot(-1), agorot(0))).toThrow(RangeError)
  })
})

describe('cashbackExpiresAt', () => {
  it('is twelve months after the credit landed', () => {
    expect(CASHBACK_LIFETIME_MONTHS).toBe(12)
    expect(cashbackExpiresAt(new Date('2026-09-09T12:00:00Z')).toISOString()).toBe(
      '2027-09-09T12:00:00.000Z',
    )
  })
})

describe('the SQL is the same rule', () => {
  // The migration owns the decision; this file is only its mirror, the same
  // stance rules.test.ts takes toward 177. 215 was applied 2026-09-09 and
  // lives in `applied/`.
  const sql = readFileSync(
    join(process.cwd(), 'migrations/applied/215_cashback_expiry.sql'),
    'utf8',
  )

  it('carries the same lifetime', () => {
    expect(sql).toContain(`now() - interval '${CASHBACK_LIFETIME_MONTHS} months'`)
  })

  it('subtracts every debit from the expired credits, floored at zero', () => {
    expect(sql).toContain('GREATEST(0, rec.expired_credit - v_debits)')
  })

  it('caps the expiry at the live balance', () => {
    expect(sql).toContain('v_amount := LEAST(v_amount, v_balance)')
  })

  it('writes the expiry as a negative ledger row against the reserve', () => {
    expect(sql).toContain("'expiry', -v_amount")
    expect(sql).toContain("'cashback_expiry'")
  })

  it('keys the sweep per user and UTC day', () => {
    expect(sql).toContain("':cashback_expiry:' || v_day")
  })
})
