import type { Agorot } from '@/lib/commerce/money'

export type PaymentProviderKind = 'cardcom' | 'mock'

export interface CreateLowProfileInput {
  /** Correlation id stored as payments.id or ReturnValue */
  paymentId: string
  orderId: string
  orderNumber: string
  amountAgorot: Agorot
  currency?: 'ILS'
  saveToken: boolean
  successRedirectUrl: string
  failedRedirectUrl: string
  webhookUrl: string
  description: string
}

export interface CreateLowProfileResult {
  lowProfileId: string
  redirectUrl: string
  raw: Record<string, unknown>
}

export interface ChargeWithTokenInput {
  paymentId: string
  orderId: string
  amountAgorot: Agorot
  cardcomToken: string
  description: string
}

export interface ChargeWithTokenResult {
  success: boolean
  transactionId: string | null
  failureCode: string | null
  failureMessage: string | null
  token?: {
    token: string
    last4: string
    brand: string
    expiryMonth: number
    expiryYear: number
  }
  raw: Record<string, unknown>
}

export interface RefundInput {
  /** Cardcom transaction id (InternalDealNumber) of the ORIGINAL successful charge. */
  transactionId: string
  /** Full amount of the original charge, in agorot. */
  amountAgorot: Agorot
  /** Partial refund in agorot; omit for a full refund of `amountAgorot`. */
  partialAmountAgorot?: Agorot
  /**
   * Cancel the deal before it is transmitted to the clearing house instead of
   * crediting it. Same money back to the customer, but no money movement on the
   * clearing side and therefore no clearing commission. Only legal on the day of
   * the charge; the caller decides, not this client.
   */
  cancelOnly?: boolean
  description: string
}

export interface RefundResult {
  success: boolean
  /** Cardcom transaction id of the NEW refund deal. */
  refundTransactionId: string | null
  /** Amount actually refunded, in agorot. */
  refundedAgorot: Agorot | null
  failureCode: string | null
  failureMessage: string | null
  raw: Record<string, unknown>
}

export interface VerifyLowProfileResult {
  success: boolean
  amountAgorot: Agorot | null
  transactionId: string | null
  lowProfileId: string
  token?: {
    token: string
    last4: string
    brand: string
    expiryMonth: number
    expiryYear: number
  }
  raw: Record<string, unknown>
}

export interface CreateDocumentLine {
  description: string
  quantity: number
  /** VAT-inclusive price of one unit, agorot. */
  unitPriceAgorot: Agorot
  /** VAT-inclusive amount for the whole line, agorot. Negative on a credit line. */
  totalAgorot: Agorot
}

export interface CreateDocumentInput {
  /**
   * Which document the provider is being asked for. Two of them are sales -
   * the tax invoice for a physical order, the receipt for a coupon advance -
   * and the third reverses one. The distinction and its reason live in
   * `lib/invoices/document.ts`; the adapter only maps it onto a provider code.
   */
  documentType: 'tax_invoice_receipt' | 'coupon_receipt' | 'credit_note'
  customerName: string | null
  customerEmail: string | null
  customerPhone: string | null
  lines: readonly CreateDocumentLine[]
  /** VAT-inclusive document total, agorot, always positive. */
  totalAgorot: Agorot
  /** The rate the lines were priced at, whole percent. */
  vatPercent: number
  /**
   * The deal this document belongs to, when there is one. A document tied to
   * the transaction reconciles against the terminal's own report; a free
   * standing one has to be matched by hand.
   */
  transactionId: string | null
  /** Printed on the document so a human can find the order it belongs to. */
  reference: string
  /** Ask the provider to email the document to the customer. */
  sendByEmail: boolean
}

export interface CreateDocumentResult {
  success: boolean
  /** The provider's document number, which is what goes on `orders.invoice_number`. */
  documentNumber: string | null
  /** Where the PDF can be fetched, if the provider returned one. */
  documentUrl: string | null
  failureCode: string | null
  failureMessage: string | null
  raw: Record<string, unknown>
}

/** One line of the terminal's own report, normalised. */
export interface TerminalTransactionRow {
  transactionId: string
  amountAgorot: number
  occurredAt: string | null
  isRefund: boolean
}

export type ListTransactionsResult =
  | { ok: true; transactions: TerminalTransactionRow[] }
  | { ok: false; reason: string }

export interface PaymentProvider {
  readonly name: PaymentProviderKind
  createLowProfile(input: CreateLowProfileInput): Promise<CreateLowProfileResult>
  chargeWithToken(input: ChargeWithTokenInput): Promise<ChargeWithTokenResult>
  verifyLowProfile(lowProfileId: string): Promise<VerifyLowProfileResult>
  refundByTransactionId(input: RefundInput): Promise<RefundResult>
  createDocument(input: CreateDocumentInput): Promise<CreateDocumentResult>
  /**
   * What the TERMINAL thinks happened over a window.
   *
   * The only way to see money that moved at the provider and left no row here -
   * a request that died between the charge being accepted and our transaction
   * committing. That failure is invisible from inside our own database by
   * construction, because there is nothing to notice.
   */
  listTransactions(input: { fromIso: string; toIso: string }): Promise<ListTransactionsResult>
}
