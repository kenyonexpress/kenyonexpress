import { buildCartView } from '@/lib/cart/pricing'
import type { CartStorageItem } from '@/lib/cart/types'
import { cashbackForPurchase } from '@/lib/cashback/engine'
import { type CommissionLineInput, calculateCommission } from '@/lib/commerce/commission'
import { buildOrderItemSnapshot, splitOnSiteCharge } from '@/lib/commerce/product-money'
import { type JournalLine, UnbalancedJournalError, assertBalanced, negateLines } from '@/lib/ledger'
import {
  type Agorot,
  BP_WHOLE,
  VAT_RATE_BP,
  agorot,
  applyBp,
  divRoundHalfUp,
  extractVat,
  multiplyAgorot,
  parseIls,
  sumAgorot,
} from '@/lib/money'
import { DEFAULT_SHIPPING_METHOD_ID, resolveShippingMethod } from '@/lib/shipping/methods'
import { describe, expect, it } from 'vitest'

/**
 * Money invariants (closeout L1).
 *
 * These pin the model the code actually implements, which differs from the
 * wording of the queue item in two places. Both are recorded in
 * docs/DECISIONS.md:
 *
 *   - The canonical module is `src/lib/money.ts`. There is no `packages/money.ts`.
 *   - Prices are VAT-inclusive. VAT is EXTRACTED from the gross with integer
 *     half-up rounding and never added on top, so the order total is
 *     `subtotal - discount + shipping` and the VAT sits inside it. A
 *     `floor(subtotal * vat / 100)` added on top would charge customers 18%
 *     more than the displayed price.
 *
 * Every loop below is driven by a seeded generator, so a failure reproduces.
 */

/** mulberry32: small, deterministic, good enough to spread test inputs. */
function seeded(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function intBetween(next: () => number, min: number, max: number): number {
  return min + Math.floor(next() * (max - min + 1))
}

const ROUNDS = 500

function physicalLine(overrides: Partial<CommissionLineInput> = {}): CommissionLineInput {
  return {
    id: 'physical-1',
    productType: 'physical',
    unitPrice: agorot(19_990),
    quantity: 1,
    platformPercent: 15,
    cashbackPercent: 0,
    ...overrides,
  }
}

function couponLine(overrides: Partial<CommissionLineInput> = {}): CommissionLineInput {
  return {
    id: 'coupon-1',
    productType: 'coupon',
    unitPrice: agorot(40_000),
    quantity: 1,
    platformPercent: 20,
    cashbackPercent: 0,
    couponPriceUnit: agorot(5_000),
    ...overrides,
  }
}

describe('rounding: every amount is integer agorot', () => {
  it('refuses to construct a fractional or unsafe amount', () => {
    expect(() => agorot(10.5)).toThrow()
    expect(() => agorot(Number.NaN)).toThrow()
    expect(() => agorot(Number.MAX_SAFE_INTEGER + 1)).toThrow()
  })

  it('converts shekel prices to agorot without float drift', () => {
    // 0.1 + 0.2 and 19.99 * 100 are the two classic float traps.
    expect(parseIls('19.99')).toBe(1999)
    expect(parseIls(19.99)).toBe(1999)
    expect(parseIls('0.30')).toBe(30)
    expect(parseIls(1.15)).toBe(115)
  })

  it('subtotal equals the sum of quantity times unit price, for any basket', () => {
    const next = seeded(1)
    for (let round = 0; round < ROUNDS; round++) {
      const lineCount = intBetween(next, 1, 6)
      const lines: CommissionLineInput[] = []
      let expected = 0
      for (let i = 0; i < lineCount; i++) {
        const unit = intBetween(next, 1, 500_000)
        const quantity = intBetween(next, 1, 12)
        expected += unit * quantity
        lines.push(
          physicalLine({
            id: `line-${i}`,
            unitPrice: agorot(unit),
            quantity,
            platformPercent: intBetween(next, 0, 10_000) / 100,
            cashbackPercent: intBetween(next, 0, 2_000) / 100,
          }),
        )
      }
      const result = calculateCommission({ idempotencyKey: `round-${round}`, lines })

      expect(result.faceValue).toBe(expected)
      expect(result.faceValue).toBe(
        sumAgorot(lines.map((l) => multiplyAgorot(l.unitPrice, l.quantity))),
      )
      for (const value of [
        result.faceValue,
        result.customerPaysNow,
        result.platformFee,
        result.supplierImmediate,
        result.supplierDue,
        result.cashbackAmount,
        result.cardCharge,
        ...result.lines.flatMap((l) => [l.platformFee, l.supplierImmediate, l.cashbackAmount]),
      ]) {
        expect(Number.isSafeInteger(value)).toBe(true)
        expect(value).toBeGreaterThanOrEqual(0)
      }
    }
  })

  it('rounds half up, away from zero, using integers only', () => {
    expect(divRoundHalfUp(5, 10)).toBe(1)
    expect(divRoundHalfUp(4, 10)).toBe(0)
    expect(divRoundHalfUp(15, 10)).toBe(2)
    expect(divRoundHalfUp(-5, 10)).toBe(-1)
    // 12.5% of 1 agora is 0.125 -> 0; 50% of 1 agora is 0.5 -> 1.
    expect(applyBp(agorot(1), 1250)).toBe(0)
    expect(applyBp(agorot(1), 5000)).toBe(1)
  })
})

describe('VAT: extracted from the gross, never added on top', () => {
  it('uses one rate for the whole app', () => {
    expect(VAT_RATE_BP).toBe(1800)
  })

  it('net plus VAT is exactly the gross, for any amount', () => {
    const next = seeded(2)
    for (let round = 0; round < ROUNDS; round++) {
      const gross = agorot(intBetween(next, 0, 50_000_000))
      const { net, vat } = extractVat(gross)

      expect(Number.isSafeInteger(net)).toBe(true)
      expect(Number.isSafeInteger(vat)).toBe(true)
      expect(net + vat).toBe(gross)
      expect(vat).toBeGreaterThanOrEqual(0)
      // The rounded net is within half an agora of the exact quotient, checked
      // with integers: |net * (10000 + rate) - gross * 10000| <= (10000 + rate) / 2.
      const denominator = BP_WHOLE + VAT_RATE_BP
      expect(Math.abs(net * denominator - gross * BP_WHOLE) * 2).toBeLessThanOrEqual(denominator)
    }
  })

  it('splits the canonical 118 shekel receipt into 100 and 18', () => {
    expect(extractVat(agorot(11_800))).toMatchObject({ net: 10_000, vat: 1_800 })
  })

  it('order total is subtotal plus shipping, with the VAT inside it', () => {
    type ProductRow = Parameters<typeof buildCartView>[2][number]
    const product: ProductRow = {
      id: 'p1',
      slug: 'p1',
      name_he: 'מוצר',
      type: 'physical',
      kenyon_price: 118,
      stock_quantity: 50,
      status: 'active',
      deleted_at: null,
      images: ['https://cdn.example/p1.jpg'],
      is_coupon_enabled: false,
      platform_percent: 10,
      coupon_price_ils: null,
      cashback_percent: 0,
    }
    const items: CartStorageItem[] = [{ product_id: 'p1', variant_id: null, quantity: 3 }]
    const paidShipping = {
      ...resolveShippingMethod(DEFAULT_SHIPPING_METHOD_ID),
      costAgorot: agorot(2_500),
    }

    const cart = buildCartView('cart-1', items, [product], [], null, paidShipping)

    expect(cart.subtotal).toBe(3 * 11_800)
    expect(cart.shipping?.cost).toBe(2_500)
    expect(cart.total).toBe(cart.subtotal + 2_500)
    // The VAT is a reporting split of what was charged, not an extra charge.
    const { net, vat } = extractVat(agorot(cart.subtotal))
    expect(net + vat).toBe(cart.subtotal)
    expect(cart.total).toBe(net + vat + 2_500)
  })
})

describe('physical split: platform_percent of the charge, snapshotted per order item', () => {
  it('fee is the percent of the line total and the supplier gets the exact residual', () => {
    const next = seeded(3)
    for (let round = 0; round < ROUNDS; round++) {
      const unit = intBetween(next, 1, 2_000_000)
      const quantity = intBetween(next, 1, 20)
      const percentHundredths = intBetween(next, 0, 10_000)
      const percent = percentHundredths / 100
      const amount = unit * quantity

      const result = calculateCommission({
        idempotencyKey: `split-${round}`,
        lines: [
          physicalLine({ unitPrice: agorot(unit), quantity, platformPercent: percent.toFixed(2) }),
        ],
      })
      const line = result.lines[0]
      if (!line) throw new Error('expected one line')

      // amount * platform_percent / 100, in basis points, rounded half up once.
      expect(line.platformFee).toBe(divRoundHalfUp(amount * percentHundredths, BP_WHOLE))
      expect(line.platformFee + line.supplierImmediate).toBe(amount)
      expect(line.customerPaysNow).toBe(amount)
      expect(line.balanceDueAtBusiness).toBe(0)
      expect(line.platformPercentBps).toBe(percentHundredths)

      // The standalone splitter agrees with the commission calculator.
      const split = splitOnSiteCharge(agorot(amount), percent.toFixed(2))
      expect(split.platformFee).toBe(line.platformFee)
      expect(split.supplierDue).toBe(line.supplierImmediate)
    }
  })

  it('has no default percent: a line without one is refused', () => {
    expect(() =>
      calculateCommission({
        idempotencyKey: 'no-percent',
        lines: [physicalLine({ platformPercent: null })],
      }),
    ).toThrow(/platform percent is required/)
  })

  it('two products with different percents are split at their own rate', () => {
    const result = calculateCommission({
      idempotencyKey: 'dynamic',
      lines: [
        physicalLine({ id: 'a', unitPrice: agorot(10_000), platformPercent: 10 }),
        physicalLine({ id: 'b', unitPrice: agorot(10_000), platformPercent: 30 }),
      ],
    })
    expect(result.lines.map((l) => l.platformFee)).toEqual([1_000, 3_000])
    expect(result.platformFee).toBe(4_000)
    expect(result.supplierImmediate).toBe(16_000)
  })

  it('the order item snapshot is a value that survives a later product edit', () => {
    const productRow = { platform_percent: 30, supplier_split_percent: 70 }
    const snapshot = buildOrderItemSnapshot({
      type: 'physical',
      platformPercent: productRow.platform_percent,
      supplierSplitPercent: productRow.supplier_split_percent,
      discountPercent: null,
      couponPriceIls: null,
      supplier: { name: 'ספק', phone: null, address: null, logoUrl: null },
    })

    productRow.platform_percent = 15
    productRow.supplier_split_percent = 85

    expect(snapshot.platform_percent).toBe(30)
    expect(snapshot.supplier_split_percent).toBe(70)
    expect(snapshot.platform_percent + snapshot.supplier_split_percent).toBe(100)
  })

  it('refuses to snapshot a product that has no split', () => {
    expect(() =>
      buildOrderItemSnapshot({
        type: 'physical',
        platformPercent: null,
        supplierSplitPercent: null,
        discountPercent: null,
        couponPriceIls: null,
        supplier: null,
      }),
    ).toThrow(/split pair/)
  })
})

describe('coupon: the whole voucher price is platform revenue', () => {
  it('platform keeps the full prepayment, supplier is owed nothing, nothing is held', () => {
    const next = seeded(4)
    for (let round = 0; round < ROUNDS; round++) {
      const face = intBetween(next, 100, 1_000_000)
      const couponPrice = intBetween(next, 1, face)
      const quantity = intBetween(next, 1, 10)

      const result = calculateCommission({
        idempotencyKey: `coupon-${round}`,
        lines: [
          couponLine({
            unitPrice: agorot(face),
            couponPriceUnit: agorot(couponPrice),
            quantity,
            // Present, as the catalogue requires, and irrelevant to the outcome.
            platformPercent: intBetween(next, 0, 100),
          }),
        ],
      })
      const line = result.lines[0]
      if (!line) throw new Error('expected one line')

      expect(line.customerPaysNow).toBe(couponPrice * quantity)
      expect(line.platformFee).toBe(line.customerPaysNow)
      expect(line.platformPercentBps).toBe(BP_WHOLE)
      expect(line.supplierImmediate).toBe(0)
      expect(line.supplierDue).toBe(0)
      // The rest is paid to the supplier at the counter and never passes
      // through the platform, so there is nothing to hold in escrow.
      expect(line.balanceDueAtBusiness).toBe((face - couponPrice) * quantity)
      expect(line.customerPaysNow + line.balanceDueAtBusiness).toBe(line.faceValue)
      expect(result.supplierDue).toBe(0)
    }
  })

  it('exposes no escrow amount at all', () => {
    const result = calculateCommission({ idempotencyKey: 'no-escrow', lines: [couponLine()] })
    const keys = [...Object.keys(result), ...result.lines.flatMap((l) => Object.keys(l))]
    expect(keys.filter((key) => /escrow/i.test(key))).toEqual([])
  })

  it('refuses a coupon priced above its face value or without a price', () => {
    expect(() =>
      calculateCommission({
        idempotencyKey: 'over',
        lines: [couponLine({ couponPriceUnit: agorot(40_001) })],
      }),
    ).toThrow(RangeError)
    expect(() =>
      calculateCommission({
        idempotencyKey: 'missing',
        lines: [couponLine({ couponPriceUnit: undefined })],
      }),
    ).toThrow(/coupon price is required/)
  })

  it('wallet credit lowers the card charge and leaves the settlement untouched', () => {
    const lines = [couponLine(), physicalLine()]
    const plain = calculateCommission({ idempotencyKey: 'w0', lines })
    const withWallet = calculateCommission({
      idempotencyKey: 'w1',
      lines,
      walletApplied: agorot(3_000),
    })

    expect(withWallet.cardCharge).toBe(plain.customerPaysNow - 3_000)
    expect(withWallet.cardCharge + withWallet.walletApplied).toBe(withWallet.customerPaysNow)
    expect(withWallet.platformFee).toBe(plain.platformFee)
    expect(withWallet.supplierDue).toBe(plain.supplierDue)
    expect(withWallet.cashbackAmount).toBe(plain.cashbackAmount)
  })
})

describe('cashback: the ledger sum is the wallet balance', () => {
  const USER = 'user-1'

  /** Wallet balance as the ledger defines it: credits to the liability account. */
  function walletBalance(journals: readonly (readonly JournalLine[])[]): number {
    let balance = 0
    for (const lines of journals) {
      for (const line of lines) {
        if (line.kind === 'customer_wallet' && line.userId === USER) {
          balance -= line.amountAgorot
        }
      }
    }
    return balance
  }

  function earned(amount: Agorot): JournalLine[] {
    return [
      { kind: 'platform_revenue', amountAgorot: amount },
      { kind: 'customer_wallet', amountAgorot: -amount, userId: USER },
    ]
  }

  function spent(amount: Agorot): JournalLine[] {
    return [
      { kind: 'customer_wallet', amountAgorot: amount, userId: USER },
      { kind: 'cardcom_clearing', amountAgorot: -amount },
    ]
  }

  it('running wallet balance equals earned minus spent, and every journal balances', () => {
    const next = seeded(5)
    for (let round = 0; round < 100; round++) {
      const journals: JournalLine[][] = []
      let expected = 0

      for (let purchase = 1; purchase <= 12; purchase++) {
        const paid = agorot(intBetween(next, 100, 300_000))
        const cashback = cashbackForPurchase(purchase, paid)
        if (cashback > 0) {
          journals.push(earned(cashback))
          expected += cashback
        }
        // Spend part of whatever is available, never more than the balance.
        const spend = intBetween(next, 0, expected)
        if (spend > 0) {
          journals.push(spent(agorot(spend)))
          expected -= spend
        }
      }

      journals.forEach((lines, index) => assertBalanced(`journal-${round}-${index}`, lines))
      expect(journals.flat().reduce((sum, line) => sum + line.amountAgorot, 0)).toBe(0)
      expect(walletBalance(journals)).toBe(expected)
      expect(walletBalance(journals)).toBeGreaterThanOrEqual(0)
    }
  })

  it('a reversal returns the wallet to exactly where it was', () => {
    const grant = earned(agorot(1_234))
    const before = walletBalance([])
    const reversal = negateLines(grant)

    assertBalanced('reversal', reversal)
    expect(walletBalance([grant])).toBe(1_234)
    expect(walletBalance([grant, reversal])).toBe(before)
  })

  it('a one-sided wallet credit is rejected before it reaches the database', () => {
    expect(() =>
      assertBalanced('lopsided', [{ kind: 'customer_wallet', amountAgorot: -500, userId: USER }]),
    ).toThrow(UnbalancedJournalError)
    expect(() =>
      assertBalanced('float', [
        { kind: 'platform_revenue', amountAgorot: 10.5 },
        { kind: 'customer_wallet', amountAgorot: -10.5, userId: USER },
      ]),
    ).toThrow(TypeError)
  })

  it('cashback is a rounded integer share of what was paid on site', () => {
    const result = calculateCommission({
      idempotencyKey: 'cashback',
      lines: [couponLine({ cashbackPercent: '2.5', couponPriceUnit: agorot(4_999) })],
    })
    // 2.5% of 49.99 is 1.24975 -> 125 agorot, on the prepayment and not the face.
    expect(result.cashbackAmount).toBe(divRoundHalfUp(4_999 * 250, BP_WHOLE))
    expect(result.cashbackAmount).toBe(125)
  })
})
