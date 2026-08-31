import { type Agorot, agorot, sumAgorot } from '@/lib/commerce/money'
import { VAT_RATE_BP } from '@/lib/money'

/**
 * What a tax document says, computed before anything is sent anywhere.
 *
 * Pure on purpose, and separated from the provider adapter for the reason [55]
 * measured before a line was written: the wire format of Cardcom's document
 * module cannot be verified from this machine (no `CARDCOM_*` in the
 * environment, and the only doc in the repo describes v11 JSON while the live
 * client is legacy `/Interface/*.aspx`). Everything ABOUT the document -- which
 * lines it carries, what the VAT split is, what it must add up to -- is
 * knowable and testable here. Only the field names on the wire are not, and
 * they live in one adapter that can be corrected in one place.
 *
 * WHAT THE DOCUMENT COVERS
 *
 * The money the provider actually moved, and nothing else. A receipt whose
 * total does not match the customer's card statement is worse than no receipt:
 * it is a document that has to be explained. So `buildInvoiceDocument` refuses
 * to build when its lines do not add up to the charged amount, rather than
 * emitting a plausible document with a silent discrepancy.
 *
 * That rule decides the two awkward cases by itself:
 *
 *   - Wallet credit spent on the order is a means of payment the platform
 *     already holds, so it reduces what the card moved and appears as its own
 *     (negative) line.
 *   - A platform-funded discount reduces it too, for the same reason, and gets
 *     its own line as well. Naming them separately is what lets the lines add
 *     up without quietly editing an item's price, which would misstate what the
 *     customer was charged per product.
 *
 * VAT
 *
 * Prices in this catalogue are VAT-inclusive, as consumer prices in Israel are,
 * so VAT is EXTRACTED from the total rather than added to it:
 *
 *     vat = round(total * rate / (100 + rate)),  net = total - vat
 *
 * in integer agorot, computed once on the document total rather than per line
 * and summed. Per-line rounding then summing can miss the document total by an
 * agora per line, and the CHECK on `invoices` (net + vat = total) exists to
 * make that impossible to store rather than merely unlikely.
 *
 * The rate is a fact about the day of issue (17% until 2024-12-31, 18% from
 * 2025-01-01), which is why it is stored per document and never re-derived when
 * one is reprinted. VAT-exempt cases (Eilat, an exempt dealer) are NOT modelled
 * here; there is no field in this schema that could carry that status, and
 * inventing an exemption is exactly the kind of guess that makes a tax document
 * wrong in the direction that costs money.
 */

/**
 * The three documents this system can owe.
 *
 * `coupon_receipt` is not a tax invoice, and that distinction is substantive
 * rather than cosmetic. A coupon sale takes money now for something consumed
 * later at a supplier's counter; the project decided on 2026-07-28 that the
 * prepayment is an ADVANCE, which is also why the product page hides VAT on
 * coupons. Issuing a tax invoice for it asserts a taxable sale that has not
 * happened. So a coupon-only order gets a receipt for money received, at VAT 0,
 * and `isTaxableDocument` is the single place that rule is written down.
 */
export type InvoiceDocumentType = 'tax_invoice_receipt' | 'coupon_receipt' | 'credit_note'

/**
 * Whether VAT is stated on this document.
 *
 * VAT 0 on a coupon receipt is NOT a claim of exemption - there is no field in
 * this schema that could carry an exempt status and inventing one is the kind of
 * guess that makes a tax document wrong in the expensive direction. It is the
 * statement that the VAT event has not occurred yet.
 */
export function isTaxableDocument(documentType: InvoiceDocumentType): boolean {
  return documentType !== 'coupon_receipt'
}

/**
 * Which document an order is owed, from what it contains.
 *
 * A MIXED ORDER GETS THE TAX INVOICE, NOT TWO DOCUMENTS. Splitting one card
 * charge across two documents gives the customer two numbers and half a
 * statement to reconcile against each. Choosing the stricter document for the
 * whole order is also the direction that costs nothing if the classification
 * turns out to be wrong.
 */
export function documentTypeForOrder(
  productTypes: readonly string[],
): Extract<InvoiceDocumentType, 'tax_invoice_receipt' | 'coupon_receipt'> {
  const everyLineIsACoupon =
    productTypes.length > 0 && productTypes.every((type) => type === 'coupon')
  return everyLineIsACoupon ? 'coupon_receipt' : 'tax_invoice_receipt'
}

/**
 * Standard Israeli VAT since 2025-01-01, as a whole percent. Overridable via
 * `INVOICE_VAT_PERCENT`.
 *
 * Derived from `VAT_RATE_BP` rather than written out again. The two used to be
 * independent literals and had drifted apart (1700 there, 18 here); one number
 * about one tax should have one home, and the basis-point form is the one the
 * money module computes in.
 */
export const DEFAULT_VAT_PERCENT = VAT_RATE_BP / 100

export interface InvoiceCustomer {
  name: string | null
  email: string | null
  phone: string | null
}

export interface InvoiceLineInput {
  description: string
  quantity: number
  /** VAT-inclusive amount for the whole line, integer agorot. Negative credits. */
  totalAgorot: number
}

export interface InvoiceDocumentLine {
  description: string
  quantity: number
  /** VAT-inclusive price of one unit, integer agorot. */
  unitPriceAgorot: Agorot
  /** VAT-inclusive amount for the whole line, integer agorot. */
  totalAgorot: Agorot
}

export interface InvoiceDocumentInput {
  documentType: InvoiceDocumentType
  customer: InvoiceCustomer
  lines: readonly InvoiceLineInput[]
  /**
   * What the provider moved, integer agorot, always positive -- a credit note
   * for ₪50 is a ₪50 document, not a -₪50 one. The lines must add up to it.
   */
  chargedAgorot: number
  /** Whole percent, e.g. 18. Defaults to `DEFAULT_VAT_PERCENT`. */
  vatPercent?: number
  /** Human reference printed on the document, e.g. the order number. */
  reference: string
}

export interface InvoiceDocument {
  documentType: InvoiceDocumentType
  customer: InvoiceCustomer
  lines: readonly InvoiceDocumentLine[]
  totalAgorot: Agorot
  netAgorot: Agorot
  vatAgorot: Agorot
  vatPercent: number
  reference: string
}

/**
 * VAT extracted from a VAT-inclusive total, in integer agorot.
 *
 * Scaled to basis points before dividing so the arithmetic stays in integers up
 * to the single rounding: `18` becomes `1800`, and `total * 1800 / 11800`.
 */
export function splitVatInclusive(
  totalAgorot: number,
  vatPercent: number,
): { netAgorot: Agorot; vatAgorot: Agorot } {
  if (!Number.isSafeInteger(totalAgorot)) {
    throw new TypeError('invoice total must be integer agorot')
  }
  const rateBp = Math.round(vatPercent * 100)
  if (rateBp < 0 || rateBp > 10_000) {
    throw new RangeError('VAT percent must be between 0 and 100')
  }
  const vat = Math.round((totalAgorot * rateBp) / (10_000 + rateBp))
  return { netAgorot: agorot(totalAgorot - vat), vatAgorot: agorot(vat) }
}

/**
 * The configured VAT rate.
 *
 * Read from the environment rather than hardcoded because the rate changes by
 * legislation and a deploy is a worse instrument for that than a variable. An
 * unparseable value throws instead of falling back: silently issuing every
 * document of the day at the wrong rate is not a recoverable mistake, and a
 * boot-time throw is.
 */
export function resolveVatPercent(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.INVOICE_VAT_PERCENT
  if (raw === undefined || raw.trim() === '') return DEFAULT_VAT_PERCENT
  const parsed = Number(raw)
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
    throw new RangeError(`INVOICE_VAT_PERCENT must be a percent between 0 and 100, got "${raw}"`)
  }
  return parsed
}

/**
 * Builds the document, or refuses.
 *
 * The refusal is the point. `finalizeOrder` calls this after the card has been
 * charged, so the alternatives on a mismatch are "issue a document that
 * misstates the sale" and "leave a row in `pending` with the reason on it for
 * an admin to look at". The second is the only one that stays correct.
 */
export function buildInvoiceDocument(input: InvoiceDocumentInput): InvoiceDocument {
  const vatPercent = input.vatPercent ?? DEFAULT_VAT_PERCENT

  if (!Number.isSafeInteger(input.chargedAgorot) || input.chargedAgorot <= 0) {
    throw new RangeError('invoice charged amount must be a positive integer in agorot')
  }
  if (input.lines.length === 0) {
    throw new RangeError('invoice must have at least one line')
  }

  const lines = input.lines.map((line) => {
    if (!Number.isSafeInteger(line.totalAgorot)) {
      throw new TypeError(`invoice line "${line.description}" must be integer agorot`)
    }
    if (!Number.isSafeInteger(line.quantity) || line.quantity < 1) {
      throw new RangeError(`invoice line "${line.description}" must have a positive quantity`)
    }
    // Quantity times unit price has to equal the line total exactly, because
    // that is the arithmetic a reader will do on the printed document. A line
    // that does not divide evenly is printed as one unit at the line total
    // rather than as a rounded unit price that fails to multiply back.
    const divides = line.totalAgorot % line.quantity === 0
    const quantity = divides ? line.quantity : 1
    return {
      description: line.description,
      quantity,
      unitPriceAgorot: agorot(line.totalAgorot / quantity),
      totalAgorot: agorot(line.totalAgorot),
    }
  })

  const summed = sumAgorot(lines.map((line) => line.totalAgorot))
  if (summed !== input.chargedAgorot) {
    throw new RangeError(
      `invoice lines sum to ${summed} agorot but ${input.chargedAgorot} was charged; refusing to issue a document that does not match the money`,
    )
  }

  // A coupon receipt states no VAT, so net equals total. The CHECK on
  // `invoices` (net + vat = total) still holds, which is what keeps a zero here
  // from being storable only by accident.
  const { netAgorot, vatAgorot } = isTaxableDocument(input.documentType)
    ? splitVatInclusive(input.chargedAgorot, vatPercent)
    : { netAgorot: agorot(input.chargedAgorot), vatAgorot: agorot(0) }

  return {
    documentType: input.documentType,
    customer: input.customer,
    lines,
    totalAgorot: agorot(input.chargedAgorot),
    netAgorot,
    vatAgorot,
    vatPercent,
    reference: input.reference,
  }
}

// ---------------------------------------------------------------------------
// Order -> lines
// ---------------------------------------------------------------------------

export interface InvoiceOrderLine {
  productName: string | null
  productType: string
  quantity: number
  /** Charged on the site for this whole line, integer agorot. */
  paidOnSiteAgorot: number
  /** Left to pay at the counter, integer agorot. Descriptive only. */
  balanceDueAgorot: number
}

/**
 * Item lines plus the two credit lines, in the order they should be printed.
 *
 * A coupon line says what it is. The customer paid part of the price here and
 * owes the rest at the counter, and a receipt that shows only the part they
 * paid, with no explanation, reads as if the product cost that much.
 */
export function buildOrderInvoiceLines(input: {
  lines: readonly InvoiceOrderLine[]
  walletAppliedAgorot: number
  discountAgorot: number
}): InvoiceLineInput[] {
  const out: InvoiceLineInput[] = []

  for (const line of input.lines) {
    if (line.paidOnSiteAgorot <= 0) continue
    const name = line.productName?.trim() || 'פריט'
    const description =
      line.productType === 'coupon'
        ? line.balanceDueAgorot > 0
          ? `${name} — קופון (יתרה לתשלום בבית העסק)`
          : `${name} — קופון`
        : name
    out.push({ description, quantity: line.quantity, totalAgorot: line.paidOnSiteAgorot })
  }

  if (input.discountAgorot > 0) {
    out.push({ description: 'הנחת מבצע', quantity: 1, totalAgorot: -input.discountAgorot })
  }
  if (input.walletAppliedAgorot > 0) {
    out.push({
      description: 'זיכוי מיתרת הארנק',
      quantity: 1,
      totalAgorot: -input.walletAppliedAgorot,
    })
  }

  return out
}
