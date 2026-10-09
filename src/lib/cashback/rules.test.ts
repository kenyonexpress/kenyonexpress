import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { agorot } from '@/lib/money'
import { describe, expect, it } from 'vitest'
import {
  FIFTH_PURCHASE_BONUS_BP,
  FIRST_PURCHASE_BONUS_BP,
  orderCountBonusAgorot,
  orderCountBonusBp,
} from './rules'

describe('orderCountBonusBp', () => {
  it('awards 10% on the first purchase', () => {
    expect(orderCountBonusBp(1)).toBe(1000)
  })

  it('awards 5% on every fifth purchase', () => {
    for (const rank of [5, 10, 15, 100]) {
      expect(orderCountBonusBp(rank)).toBe(500)
    }
  })

  it('awards nothing in between', () => {
    for (const rank of [2, 3, 4, 6, 7, 8, 9, 11, 99, 101]) {
      expect(orderCountBonusBp(rank)).toBe(0)
    }
  })

  it('rank 1 is the first-purchase rate, never the fifth rate', () => {
    // 1 % 5 !== 0 so there is no overlap today, but the intent is pinned:
    // the two rules can never both fire on one order.
    expect(orderCountBonusBp(1)).toBe(FIRST_PURCHASE_BONUS_BP)
  })

  it('refuses a non-positive or fractional rank', () => {
    expect(() => orderCountBonusBp(0)).toThrow(RangeError)
    expect(() => orderCountBonusBp(-1)).toThrow(RangeError)
    expect(() => orderCountBonusBp(1.5)).toThrow(RangeError)
  })
})

describe('orderCountBonusAgorot', () => {
  it('is integer agorot with half-up rounding', () => {
    // 10% of 99.99 ILS (9999 agorot) = 999.9 -> 1000 agorot.
    expect(orderCountBonusAgorot(agorot(9999), 1)).toBe(1000)
    // 5% of 0.99 ILS (99 agorot) = 4.95 -> 5 agorot.
    expect(orderCountBonusAgorot(agorot(99), 5)).toBe(5)
    // 5% of 0.10 ILS (10 agorot) = 0.5 -> rounds up to 1.
    expect(orderCountBonusAgorot(agorot(10), 5)).toBe(1)
  })

  it('is zero off-rule', () => {
    expect(orderCountBonusAgorot(agorot(123456), 3)).toBe(0)
  })
})

describe('the SQL is the same rule', () => {
  // The migration owns the decision; this file is only its mirror. If someone
  // retunes one side, this fails before the two can drift apart in production.
  // 177 was applied 2026-09-09 and moved to `applied/`; the mirror follows the
  // file rather than the directory, because what it checks is that the rate in
  // TypeScript still equals the rate the database is actually running.
  const sql = readFileSync(
    join(process.cwd(), 'migrations/applied/177_cashback_ledger.sql'),
    'utf8',
  )

  it('carries the same first-purchase rate', () => {
    expect(sql).toContain(
      `v_bp := ${FIRST_PURCHASE_BONUS_BP}; v_entry_type := 'first_purchase_bonus'`,
    )
  })

  it('carries the same every-fifth rate', () => {
    expect(sql).toContain(
      `v_bp := ${FIFTH_PURCHASE_BONUS_BP};  v_entry_type := 'fifth_purchase_bonus'`,
    )
  })

  it('branches on rank 1 and rank % 5', () => {
    expect(sql).toContain('IF v_rank = 1 THEN')
    expect(sql).toContain('ELSIF v_rank % 5 = 0 THEN')
  })

  it('rounds half-up in integer arithmetic, like applyBp', () => {
    expect(sql).toContain('(v_basis * v_bp + 5000) / 10000')
  })
})
