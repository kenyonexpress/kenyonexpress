import { type Agorot, agorot } from '@/lib/commerce/money'

/** Israeli standard VAT rate in basis points (18.00%). */
export const VAT_RATE_BPS = 1800

/** 100% + VAT in basis points (118%). */
const INCLUSIVE_DIVISOR_BPS = 10_000 + VAT_RATE_BPS

export type VatSplit = {
  /** VAT-inclusive total (catalog / charge amount). */
  grossAgorot: Agorot
  /** Net of VAT. */
  netAgorot: Agorot
  /** VAT portion. */
  vatAgorot: Agorot
  vatRateBps: typeof VAT_RATE_BPS
}

/**
 * Split a VAT-inclusive ILS amount into net + VAT using the Israeli formula:
 * vat = round(gross * 18 / 118), net = gross - vat.
 * Server-side only; never trust client tax fields.
 */
export function splitInclusiveVat(grossAgorot: Agorot | number): VatSplit {
  const gross = typeof grossAgorot === 'number' ? agorot(grossAgorot) : grossAgorot
  if (gross < 0) throw new RangeError('grossAgorot must be >= 0')

  const vat = agorot(Math.round((gross * VAT_RATE_BPS) / INCLUSIVE_DIVISOR_BPS))
  const net = agorot(gross - vat)
  return {
    grossAgorot: gross,
    netAgorot: net,
    vatAgorot: vat,
    vatRateBps: VAT_RATE_BPS,
  }
}

/** Build VAT from a net (ex-VAT) amount: vat = round(net * 18 / 100). */
export function addVatToNet(netAgorot: Agorot | number): VatSplit {
  const net = typeof netAgorot === 'number' ? agorot(netAgorot) : netAgorot
  if (net < 0) throw new RangeError('netAgorot must be >= 0')
  const vat = agorot(Math.round((net * VAT_RATE_BPS) / 10_000))
  const gross = agorot(net + vat)
  return {
    grossAgorot: gross,
    netAgorot: net,
    vatAgorot: vat,
    vatRateBps: VAT_RATE_BPS,
  }
}
