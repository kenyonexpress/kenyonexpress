import { calculateSettlement } from '@/server/domain/orders/settlement'
/**
 * The admin form, the product write and the settlement engine must agree.
 *
 * There are three places a product's money is computed: `previewProductMoney`
 * (what the admin sees before saving), `buildProductMoneyWrite` (what is stored)
 * and `calculateSettlement` (what the customer is actually charged). Nothing in
 * the type system ties them together, and this codebase has already shipped the
 * failure once: the product page rendered `price * 0.1` while checkout billed
 * `coupon_price_ils`, so a customer was quoted one number and charged another.
 *
 * These tests take a product as an admin would fill it in, push it through all
 * three, and assert they land on the same agorot.
 */
import { describe, expect, it } from 'vitest'
import { agorot, ilsToAgorot } from './money'
import { buildProductMoneyWrite, previewProductMoney } from './product-money'

/** What an admin types into the product form. */
interface AdminEntry {
  type: 'coupon' | 'physical'
  kenyonPrice: number
  platformPercent: number
  supplierSplitPercent: number | null
  discountPercent: number | null
  couponPriceIls: number | null
}

function runAll(entry: AdminEntry, quantity = 1) {
  const write = buildProductMoneyWrite({
    type: entry.type,
    kenyonPrice: entry.kenyonPrice,
    platformPercent: entry.platformPercent,
    supplierSplitPercent: entry.supplierSplitPercent,
    discountPercent: entry.discountPercent,
    couponPriceIls: entry.couponPriceIls,
    couponExpiryDays: entry.type === 'coupon' ? 30 : null,
  })
  if (!write.ok) throw new Error(`write refused: ${write.message}`)

  const preview = previewProductMoney({
    type: entry.type,
    priceIls: write.fields.price_ils,
    platformPercent: write.fields.platform_percent,
    couponPriceIls: write.fields.coupon_price_ils,
    discountPercent: write.fields.discount_percent,
  })

  // What checkout would build from the stored row.
  const onSiteUnitIls =
    entry.type === 'coupon'
      ? (write.fields.coupon_price_ils ?? 0)
      : Math.round(
          write.fields.price_ils * (1 - (write.fields.discount_percent ?? 0) / 100) * 100,
        ) / 100

  const settlement = calculateSettlement({
    lines: [
      {
        id: 'line-1',
        productType: entry.type,
        unitPrice: ilsToAgorot(
          (entry.type === 'coupon' ? write.fields.price_ils : onSiteUnitIls).toFixed(2),
        ),
        quantity,
        ...(entry.type === 'coupon'
          ? { couponPriceUnit: ilsToAgorot(onSiteUnitIls.toFixed(2)) }
          : {}),
        platformPercent: write.fields.platform_percent,
        cashbackPercent: 0,
      },
    ],
    walletApplied: agorot(0),
    idempotencyKey: 'admin-money-agreement',
  })

  return { write, preview, settlement, line: settlement.lines[0] }
}

/** The splits the live catalog actually uses, measured 2026-07-28. */
const LIVE_SUPPLIER_SPLITS = [70, 75, 85]

describe('admin preview agrees with the settlement engine', () => {
  it('coupon: what the preview shows is what the engine charges and splits', () => {
    const { preview, line } = runAll({
      type: 'coupon',
      kenyonPrice: 200,
      platformPercent: 30,
      supplierSplitPercent: 70,
      discountPercent: null,
      couponPriceIls: 50,
    })
    expect(line).toBeDefined()
    if (!line) return

    expect(ilsToAgorot(preview.paidOnlineIls.toFixed(2))).toBe(line.paidOnSite)
    expect(ilsToAgorot(preview.platformKeepsIls.toFixed(2))).toBe(line.commission)
    expect(ilsToAgorot(preview.supplierGetsIls.toFixed(2))).toBe(line.supplierDue)
    expect(ilsToAgorot(preview.balanceAtBusinessIls.toFixed(2))).toBe(line.balanceDueAtBusiness)
  })

  it('physical: the discount reduces the charge in both, by the same amount', () => {
    const { preview, line } = runAll({
      type: 'physical',
      kenyonPrice: 200,
      platformPercent: 25,
      supplierSplitPercent: 75,
      discountPercent: 10,
      couponPriceIls: null,
    })
    expect(line).toBeDefined()
    if (!line) return

    expect(preview.paidOnlineIls).toBe(180)
    expect(ilsToAgorot(preview.paidOnlineIls.toFixed(2))).toBe(line.paidOnSite)
    expect(ilsToAgorot(preview.platformKeepsIls.toFixed(2))).toBe(line.commission)
    expect(ilsToAgorot(preview.supplierGetsIls.toFixed(2))).toBe(line.supplierDue)
  })

  it('agrees across every split the live catalog uses, on both types', () => {
    for (const supplierSplit of LIVE_SUPPLIER_SPLITS) {
      for (const entry of [
        {
          type: 'coupon' as const,
          kenyonPrice: 249.9,
          platformPercent: 100 - supplierSplit,
          supplierSplitPercent: supplierSplit,
          discountPercent: null,
          couponPriceIls: 99,
        },
        {
          type: 'physical' as const,
          kenyonPrice: 249.9,
          platformPercent: 100 - supplierSplit,
          supplierSplitPercent: supplierSplit,
          discountPercent: 15,
          couponPriceIls: null,
        },
      ]) {
        const { preview, line } = runAll(entry)
        const label = `${entry.type}/${supplierSplit}`
        expect(line, label).toBeDefined()
        if (!line) continue
        expect(ilsToAgorot(preview.paidOnlineIls.toFixed(2)), label).toBe(line.paidOnSite)
        expect(ilsToAgorot(preview.platformKeepsIls.toFixed(2)), label).toBe(line.commission)
        expect(ilsToAgorot(preview.supplierGetsIls.toFixed(2)), label).toBe(line.supplierDue)
      }
    }
  })

  it('the two shares always add back to exactly what the customer paid', () => {
    // The residual rule. Applying both percents independently is how an agora
    // goes missing on one line and appears from nowhere on another.
    for (const price of [0.01, 1, 7.77, 33.33, 99.9, 1234.56]) {
      for (const platformPercent of [0, 0.01, 15, 33.33, 66.67, 99.99, 100]) {
        const { line } = runAll({
          type: 'physical',
          kenyonPrice: price,
          platformPercent,
          supplierSplitPercent: null,
          discountPercent: 0,
          couponPriceIls: null,
        })
        const label = `${price}@${platformPercent}`
        expect(line, label).toBeDefined()
        if (!line) continue
        expect(line.commission + line.supplierDue, label).toBe(line.paidOnSite)
      }
    }
  })

  it('scales to quantity without losing an agora', () => {
    const { line } = runAll(
      {
        type: 'coupon',
        kenyonPrice: 100,
        platformPercent: 33.33,
        supplierSplitPercent: null,
        discountPercent: null,
        couponPriceIls: 33.33,
      },
      7,
    )
    expect(line).toBeDefined()
    if (!line) return
    expect(line.commission + line.supplierDue).toBe(line.paidOnSite)
    expect(line.perUnitVoucher).toHaveLength(7)
    const perUnitPaid = line.perUnitVoucher.reduce((sum, v) => sum + v.paidOnSite, 0)
    expect(perUnitPaid).toBe(line.paidOnSite)
  })

  it('a coupon at platform_percent 100 keeps everything, and is a choice not a constant', () => {
    // The old engine hardcoded exactly this outcome for every coupon. It is
    // still reachable, but only when an admin asks for it.
    const { line } = runAll({
      type: 'coupon',
      kenyonPrice: 200,
      platformPercent: 100,
      supplierSplitPercent: 0,
      discountPercent: null,
      couponPriceIls: 50,
    })
    expect(line).toBeDefined()
    if (!line) return
    expect(line.supplierDue).toBe(0)
    expect(line.commission).toBe(line.paidOnSite)
  })

  it('a coupon at platform_percent 0 hands the whole prepayment to the supplier', () => {
    const { line } = runAll({
      type: 'coupon',
      kenyonPrice: 200,
      platformPercent: 0,
      supplierSplitPercent: 100,
      discountPercent: null,
      couponPriceIls: 50,
    })
    expect(line).toBeDefined()
    if (!line) return
    expect(line.commission).toBe(0)
    expect(line.supplierDue).toBe(line.paidOnSite)
  })
})
