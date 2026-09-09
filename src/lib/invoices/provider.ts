import type { CreateDocumentInput, CreateDocumentResult } from '@/lib/payments/types'

/**
 * Who issues the tax document, chosen independently of who takes the money.
 *
 * WHAT WAS WELDED TOGETHER, AND WHY IT MATTERS
 *
 * `issueInvoice` called `getPaymentProvider(cardcomAccountId).createDocument()`.
 * That is Cardcom's document module, reached through the object that also
 * charges the card, so "who issues our invoices" was not a decision anybody
 * could make -- it was a consequence of which terminal took the payment.
 *
 * Those are genuinely separate businesses in Israel. Most shops charge through
 * one company and invoice through another (חשבונית ירוקה, iCount, Rivhit), and
 * Cardcom's document module is a paid add-on that an account may simply not
 * have. A shop that switched acquirers would, under the old shape, have
 * switched invoice providers at the same moment, mid-year, mid-numbering
 * sequence.
 *
 * THE NUMBER STAYS THE PROVIDER'S, AND THAT IS A REFUSAL OF PART OF THE SPEC
 *
 * "Sequential numbering per year" is asked for and is deliberately NOT
 * implemented here. Israeli law requires an unbroken sequence per document type
 * per year, and what makes a sequence acceptable to רשות המסים is that it comes
 * out of approved software with its own retention and audit. Generating our own
 * counter would produce a second numbering authority: two systems that both
 * believe they own the sequence, diverging the first time a document is issued
 * outside this codebase -- by an accountant, from the provider's own console,
 * for a sale that happened by bank transfer.
 *
 * So `document_number` is written from `result.documentNumber` and from nowhere
 * else, and `invoices` has no sequence, no counter and no default. The gap that
 * IS ours to close is making sure a document is always requested; the number on
 * it belongs to whoever is legally answerable for it.
 *
 * WHY THE STUBS REFUSE INSTEAD OF PRETENDING
 *
 * `green_invoice` and `icount` are named here with the shape they would need
 * and no request code, because writing an API client against documentation
 * nobody has opened produces something that looks finished and fails on the
 * first real call -- and the first real call is a customer's tax receipt. They
 * return a refusal naming themselves, which lands in `invoices.last_error`
 * where an operator will read it, rather than a 500.
 */

export type DocumentProviderId = 'cardcom' | 'green_invoice' | 'icount' | 'mock'

export interface DocumentProvider {
  readonly id: DocumentProviderId
  createDocument(input: CreateDocumentInput): Promise<CreateDocumentResult>
}

/** The env var that picks one. Absent means `cardcom`, which is today's behaviour. */
export const INVOICE_PROVIDER_ENV = 'INVOICE_PROVIDER'

export const DOCUMENT_PROVIDER_IDS: readonly DocumentProviderId[] = [
  'cardcom',
  'green_invoice',
  'icount',
  'mock',
] as const

export function isDocumentProviderId(value: unknown): value is DocumentProviderId {
  return typeof value === 'string' && (DOCUMENT_PROVIDER_IDS as readonly string[]).includes(value)
}

/**
 * Which provider this environment asks for.
 *
 * An UNRECOGNISED value throws rather than falling back to `cardcom`. A
 * fallback would mean a typo in `INVOICE_PROVIDER` silently sends every tax
 * document to the wrong company, and the symptom is invoices appearing in an
 * account nobody is watching. `documentIssuingMode` already refuses to run
 * without credentials; this refuses to run against the wrong ones.
 */
export function resolveDocumentProviderId(
  env: NodeJS.ProcessEnv = process.env,
): DocumentProviderId {
  const raw = env[INVOICE_PROVIDER_ENV]?.trim()
  if (!raw) return 'cardcom'
  if (!isDocumentProviderId(raw)) {
    throw new RangeError(
      `${INVOICE_PROVIDER_ENV} must be one of ${DOCUMENT_PROVIDER_IDS.join(', ')} (got "${raw}")`,
    )
  }
  return raw
}

/** A refusal in the shape `issueInvoice` already handles: retryable, recorded. */
function refuse(id: DocumentProviderId, message: string): CreateDocumentResult {
  return {
    success: false,
    documentNumber: null,
    documentUrl: null,
    failureCode: 'provider_not_implemented',
    failureMessage: message,
    raw: { provider: id },
  }
}

/**
 * The mock, and it is deliberately loud about being one.
 *
 * `mock-doc-…` rather than a plausible number, because the failure this guards
 * against is a mock document number reaching a REAL order -- this project runs
 * against the hosted database, so a stray mock run stamps whatever it returns
 * onto a live row as that order's invoice number. A number that could pass for
 * real is the one thing this must never return. `documentIssuingMode` is what
 * stops the mock being reached by accident; this is the second line.
 */
export const mockDocumentProvider: DocumentProvider = {
  id: 'mock',
  async createDocument(input) {
    return {
      success: true,
      documentNumber: `mock-doc-${input.reference}`,
      documentUrl: null,
      failureCode: null,
      failureMessage: null,
      raw: { provider: 'mock', documentType: input.documentType },
    }
  },
}

/**
 * Green Invoice (חשבונית ירוקה).
 *
 * Shape only. Issuing through it needs an API key and a business id from their
 * console, and a request body nobody here has validated against their API.
 */
export const greenInvoiceProvider: DocumentProvider = {
  id: 'green_invoice',
  async createDocument() {
    return refuse(
      'green_invoice',
      'ספק החשבוניות green_invoice טרם חובר: נדרשים GREEN_INVOICE_API_KEY ו-GREEN_INVOICE_API_SECRET.',
    )
  },
}

/** iCount. Same shape, same reason. */
export const icountProvider: DocumentProvider = {
  id: 'icount',
  async createDocument() {
    return refuse(
      'icount',
      'ספק החשבוניות icount טרם חובר: נדרשים ICOUNT_COMPANY_ID, ICOUNT_USER ו-ICOUNT_PASSWORD.',
    )
  },
}

/**
 * Build the provider this environment asks for.
 *
 * `cardcom` is a FUNCTION parameter rather than an import, so this module stays
 * free of the payment layer. `issueInvoice` already holds the Cardcom account
 * id it needs, and passing the built adapter in keeps the direction of
 * dependency one-way: invoices know about providers, providers do not know
 * about invoices.
 */
export function selectDocumentProvider(
  // Structurally typed on the one method that matters, so the payment provider
  // satisfies it as it is. Requiring the full `DocumentProvider` would have
  // meant adding an `id` to `PaymentProvider` -- making the payment layer carry
  // a field that exists for the invoice layer's benefit, which is the coupling
  // this module was written to undo, pointing the other way.
  cardcom: () => Pick<DocumentProvider, 'createDocument'>,
  env: NodeJS.ProcessEnv = process.env,
): DocumentProvider {
  switch (resolveDocumentProviderId(env)) {
    case 'cardcom':
      return { id: 'cardcom', createDocument: (input) => cardcom().createDocument(input) }
    case 'green_invoice':
      return greenInvoiceProvider
    case 'icount':
      return icountProvider
    case 'mock':
      return mockDocumentProvider
  }
}
