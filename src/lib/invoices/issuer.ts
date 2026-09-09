import type { InvoiceDocumentType } from '@/lib/invoices/document'

/**
 * Who issues the document, per terminal.
 *
 * A tax document is issued by a business, and which business that is follows
 * the money: the terminal that took the payment (`payments.cardcom_account_id`)
 * is the issuer of record for that sale. The platform terminal is the default
 * issuer for everything, exactly as `loadCardcomAccounts` makes it the default
 * for charging; an anchor supplier clearing on its own terminal issues under
 * its own name and tax id.
 *
 * Config and not a database table, for the reason `CardcomAccount.supplierIds`
 * already wrote down: an issuer identity is provisioned together with the
 * terminal credentials, and an admin editing rows must not be able to change
 * whose name appears on a tax document by typing into a form.
 *
 * SERIES AND NUMBERING LIVE HERE TOO, because they are facts about the issuer:
 * each terminal numbers its own documents, and each document type is its own
 * series. Interleaving two terminals into one sequence would interleave two
 * businesses' books.
 */
export interface InvoiceIssuer {
  /** The Cardcom account this identity belongs to. 'platform' by default. */
  accountId: string
  businessName: string
  /** ח.פ / עוסק מורשה. Null renders the PDF without a tax-id line. */
  taxId: string | null
  address: string | null
}

const PLATFORM_ACCOUNT_ID = 'platform'

type RawIssuer = {
  accountId?: unknown
  businessName?: unknown
  taxId?: unknown
  address?: unknown
}

function text(value: unknown): string | null {
  if (typeof value === 'string' && value.trim() !== '') return value.trim()
  return null
}

function parseExtraIssuers(raw: string | undefined): RawIssuer[] {
  if (!raw || raw.trim() === '') return []
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new RangeError('INVOICE_ISSUERS is not valid JSON')
  }
  if (!Array.isArray(parsed)) {
    throw new RangeError('INVOICE_ISSUERS must be a JSON array')
  }
  return parsed as RawIssuer[]
}

/**
 * The issuer identity for a terminal.
 *
 * Unknown and null account ids resolve to the platform issuer rather than
 * throwing, in the same direction `selectAccountForSuppliers` falls: the
 * platform is the merchant of record and the identity that definitely exists.
 * A misconfigured extra issuer therefore costs a wrong-but-real business name
 * on a supplementary PDF, not a dead document queue.
 */
export function resolveInvoiceIssuer(
  accountId?: string | null,
  env: NodeJS.ProcessEnv = process.env,
): InvoiceIssuer {
  const platform: InvoiceIssuer = {
    accountId: PLATFORM_ACCOUNT_ID,
    businessName: text(env.INVOICE_ISSUER_NAME) ?? 'KenyonExpress',
    taxId: text(env.INVOICE_ISSUER_TAX_ID),
    address: text(env.INVOICE_ISSUER_ADDRESS),
  }
  const wanted = text(accountId)
  if (!wanted || wanted === PLATFORM_ACCOUNT_ID) return platform

  for (const raw of parseExtraIssuers(env.INVOICE_ISSUERS)) {
    const id = text(raw.accountId)
    if (id !== wanted) continue
    const businessName = text(raw.businessName)
    if (!businessName) break
    return {
      accountId: id,
      businessName,
      taxId: text(raw.taxId),
      address: text(raw.address),
    }
  }
  return platform
}

/**
 * The counter row a document draws its number from:
 * `<account id>:<document type>`, matching what 228 documents on
 * `invoice_counters.series`.
 */
export function invoiceSeries(
  accountId: string | null | undefined,
  documentType: InvoiceDocumentType,
): string {
  return `${text(accountId) ?? PLATFORM_ACCOUNT_ID}:${documentType}`
}

const NUMBER_PREFIX: Record<InvoiceDocumentType, string> = {
  tax_invoice_receipt: 'INV',
  coupon_receipt: 'RCP',
  credit_note: 'CRN',
}

/**
 * The human form of an allocated number, e.g. `KE-INV-000042`.
 *
 * The series is spelled into the prefix rather than left implicit, because two
 * documents from two series may legitimately carry the same integer and a
 * reader holding only the printed string has to be able to tell them apart.
 */
export function formatInvoiceNumber(
  accountId: string | null | undefined,
  documentType: InvoiceDocumentType,
  internalNumber: number,
): string {
  if (!Number.isSafeInteger(internalNumber) || internalNumber < 1) {
    throw new RangeError('internal invoice number must be a positive integer')
  }
  const account = text(accountId) ?? PLATFORM_ACCOUNT_ID
  const middle = account === PLATFORM_ACCOUNT_ID ? '' : `-${account.toUpperCase()}`
  return `KE-${NUMBER_PREFIX[documentType]}${middle}-${String(internalNumber).padStart(6, '0')}`
}
