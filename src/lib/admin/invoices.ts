/**
 * Labels and rules for the invoice screens (section 56). The documents
 * themselves are issued by src/server/payments/invoices.ts; this file only
 * names their states in Hebrew and says which of them an admin may push back
 * into the queue.
 */

export const INVOICE_TYPE_LABEL_HE: Record<string, string> = {
  tax_invoice_receipt: 'חשבונית מס/קבלה',
  coupon_receipt: 'קבלה על קופון',
  credit_note: 'חשבונית זיכוי',
}

export const INVOICE_STATUS_LABEL_HE: Record<string, string> = {
  pending: 'בתור',
  issued: 'הונפקה',
  failed: 'נכשלה',
  dead: 'נכשלה סופית',
}

export const INVOICE_STATUS_VARIANT: Record<string, 'gray' | 'yellow' | 'green' | 'red'> = {
  pending: 'yellow',
  issued: 'green',
  failed: 'red',
  dead: 'red',
}

/**
 * Only a document that was never issued may be re-queued. An issued document
 * has a number at the provider; asking for it again would mint a second one,
 * and Israeli bookkeeping treats that as two sales. "Reissue" for an issued
 * document is therefore the link, which is always the same document.
 */
export function canRequeueInvoice(status: string): boolean {
  return status === 'failed' || status === 'dead' || status === 'pending'
}

export type InvoiceSearch =
  | { kind: 'document'; value: string }
  | { kind: 'order'; value: string }
  | { kind: 'email'; value: string }
  | { kind: 'none' }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/**
 * What the admin typed, classified. A full order id is looked up exactly; an
 * address is matched against profiles; anything else is a document number
 * fragment. Blank means no filter.
 */
export function parseInvoiceSearch(raw: unknown): InvoiceSearch {
  const value = String(raw ?? '').trim()
  if (value.length === 0) return { kind: 'none' }
  if (UUID.test(value)) return { kind: 'order', value: value.toLowerCase() }
  if (value.includes('@')) return { kind: 'email', value: value.toLowerCase() }
  return { kind: 'document', value: value.slice(0, 60) }
}
