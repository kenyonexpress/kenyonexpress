import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { evaluateDiscount } from './discount'

/**
 * Regression guard for the bug that held `feat/growth-core` out of the branch.
 *
 * The campaign code was written against the pre-GOAL-1 cart, whose view carried
 * shekel floats, so it multiplied `view.subtotal` and `view.platform_fee` by 100
 * on the way into `evaluateDiscount`. Both are `Agorot` now. Left in, a 100 NIS
 * cart would have been priced as 10,000 NIS, every minimum would have passed,
 * and every percentage discount would have been a hundred times the money the
 * platform actually earns on the order.
 *
 * The source assertion is the real guard: `evaluateDiscount` is pure and cannot
 * tell what units it was handed, so no test of it alone would have caught this.
 */
function cartSource(): string {
  return readFileSync(resolve(process.cwd(), 'src/server/actions/cart.ts'), 'utf8')
}

describe('cart passes agorot to the discount engine', () => {
  it('still has the call site this guards', () => {
    expect(cartSource()).toContain('evaluateDiscount(')
  })

  it('never scales subtotal or platform_fee on the way in', () => {
    const source = cartSource()
    // Any arithmetic on either value between the view and the engine is the
    // shekel round trip coming back, whatever shape it is written in.
    expect(source).not.toMatch(/view\.subtotal\s*\*/)
    expect(source).not.toMatch(/view\.platform_fee\s*\*/)
    expect(source).not.toMatch(/Math\.round\(\s*view\.(subtotal|platform_fee)/)
  })

  it('hands the engine the view values untouched', () => {
    const source = cartSource()
    expect(source).toMatch(/payableAgorot:\s*view\.subtotal\s*,/)
    expect(source).toMatch(/commissionAgorot:\s*view\.platform_fee\s*,/)
  })
})

describe('what the x100 would have cost', () => {
  const campaign = {
    id: 'c1',
    code: 'SAVE10',
    name: 'עשרה אחוז',
    kind: 'percent' as const,
    max_uses_per_user: 1,
    allow_stacking: false,
    percent_bp: 1000,
    amount_agorot: null,
    min_order_agorot: 5_000,
    max_discount_agorot: null,
    starts_at: null,
    expires_at: null,
    max_uses: null,
    used_count: 0,
    is_active: true,
  }

  it('prices 10% of a 100 NIS cart as 10 NIS', () => {
    const result = evaluateDiscount(
      campaign,
      { payableAgorot: 10_000, commissionAgorot: 2_000 },
      new Date(),
    )
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.discountAgorot).toBe(1_000)
  })

  it('would have promised a hundred times the commission had the cart scaled it', () => {
    // The same cart, passed the way the unmerged branch passed it.
    const scaled = evaluateDiscount(
      campaign,
      { payableAgorot: 1_000_000, commissionAgorot: 200_000 },
      new Date(),
    )
    expect(scaled.ok).toBe(true)
    if (scaled.ok) expect(scaled.discountAgorot).toBe(100_000)
  })

  it('rejects a cart under the minimum instead of scaling it over', () => {
    const result = evaluateDiscount(
      campaign,
      { payableAgorot: 4_000, commissionAgorot: 800 },
      new Date(),
    )
    expect(result.ok).toBe(false)
  })
})
