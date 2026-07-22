import { agorot } from '@/lib/commerce/money'
import { VAT_RATE_BPS, addVatToNet, splitInclusiveVat } from '@/lib/commerce/vat'
import { describe, expect, it } from 'vitest'

describe('Israeli VAT 18% inclusive split', () => {
  it('exports 1800 bps', () => {
    expect(VAT_RATE_BPS).toBe(1800)
  })

  it('splits inclusive totals with round(gross * 18 / 118)', () => {
    // 118 agorot -> vat 18, net 100
    expect(splitInclusiveVat(agorot(118))).toEqual({
      grossAgorot: 118,
      netAgorot: 100,
      vatAgorot: 18,
      vatRateBps: 1800,
    })

    // 9900 agorot (₪99.00): 9900 * 18 / 118 = 1510.169... -> 1510
    const split = splitInclusiveVat(9900)
    expect(split.vatAgorot).toBe(1510)
    expect(split.netAgorot).toBe(9900 - 1510)
    expect(split.grossAgorot).toBe(9900)
  })

  it('adds VAT onto net amounts', () => {
    expect(addVatToNet(100)).toMatchObject({
      netAgorot: 100,
      vatAgorot: 18,
      grossAgorot: 118,
    })
  })

  it('rejects negatives', () => {
    expect(() => splitInclusiveVat(-1)).toThrow(/>= 0/)
  })
})
