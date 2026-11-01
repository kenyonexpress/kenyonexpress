import { describe, expect, it } from 'vitest'
import { formatInvoiceNumber, invoiceSeries, resolveInvoiceIssuer } from './issuer'

const env = (values: Record<string, string>): NodeJS.ProcessEnv =>
  values as unknown as NodeJS.ProcessEnv

describe('resolveInvoiceIssuer', () => {
  it('answers with the platform identity by default', () => {
    expect(resolveInvoiceIssuer(null, env({}))).toEqual({
      accountId: 'platform',
      businessName: 'KenyonExpress',
      taxId: null,
      address: null,
    })
  })

  it('reads the platform identity from the environment', () => {
    const issuer = resolveInvoiceIssuer(undefined, {
      INVOICE_ISSUER_NAME: 'קניון אקספרס בע"מ',
      INVOICE_ISSUER_TAX_ID: '515000000',
      INVOICE_ISSUER_ADDRESS: 'תל אביב',
    } as unknown as NodeJS.ProcessEnv)
    expect(issuer.businessName).toBe('קניון אקספרס בע"מ')
    expect(issuer.taxId).toBe('515000000')
    expect(issuer.address).toBe('תל אביב')
  })

  it('resolves a terminal to its own issuer identity', () => {
    const issuer = resolveInvoiceIssuer(
      'supplier-x',
      env({
        INVOICE_ISSUERS: JSON.stringify([
          { accountId: 'supplier-x', businessName: 'הספק בע"מ', taxId: '512345678' },
        ]),
      }),
    )
    expect(issuer).toEqual({
      accountId: 'supplier-x',
      businessName: 'הספק בע"מ',
      taxId: '512345678',
      address: null,
    })
  })

  it('falls back to the platform for an unknown or half-configured terminal', () => {
    // The same direction selectAccountForSuppliers falls: the platform is the
    // identity that definitely exists. A misconfiguration costs a wrong-but-
    // real name on a supplementary PDF, not a dead queue.
    const issuers = JSON.stringify([{ accountId: 'supplier-x' }])
    expect(resolveInvoiceIssuer('supplier-y', env({ INVOICE_ISSUERS: issuers })).accountId).toBe(
      'platform',
    )
    expect(resolveInvoiceIssuer('supplier-x', env({ INVOICE_ISSUERS: issuers })).accountId).toBe(
      'platform',
    )
  })

  it('refuses malformed configuration instead of guessing', () => {
    expect(() => resolveInvoiceIssuer('supplier-x', env({ INVOICE_ISSUERS: '{oops' }))).toThrow(
      RangeError,
    )
    expect(() =>
      resolveInvoiceIssuer('supplier-x', env({ INVOICE_ISSUERS: '{"not":"an array"}' })),
    ).toThrow(RangeError)
  })
})

describe('invoiceSeries', () => {
  it('keys one counter per terminal and document type', () => {
    // Interleaving two terminals into one sequence would interleave two
    // businesses' books; interleaving sales with credit notes would leave
    // neither series sequential.
    expect(invoiceSeries(null, 'tax_invoice_receipt')).toBe('platform:tax_invoice_receipt')
    expect(invoiceSeries('supplier-x', 'credit_note')).toBe('supplier-x:credit_note')
  })
})

describe('formatInvoiceNumber', () => {
  it('prints the series into the number so two series cannot collide on paper', () => {
    expect(formatInvoiceNumber(null, 'tax_invoice_receipt', 42)).toBe('KE-INV-000042')
    expect(formatInvoiceNumber('platform', 'coupon_receipt', 1)).toBe('KE-RCP-000001')
    expect(formatInvoiceNumber('supplier-x', 'credit_note', 7)).toBe('KE-CRN-SUPPLIER-X-000007')
  })

  it('does not pad away a number that outgrows six digits', () => {
    expect(formatInvoiceNumber(null, 'tax_invoice_receipt', 1_234_567)).toBe('KE-INV-1234567')
  })

  it('refuses a number no counter could have allocated', () => {
    expect(() => formatInvoiceNumber(null, 'tax_invoice_receipt', 0)).toThrow(RangeError)
    expect(() => formatInvoiceNumber(null, 'tax_invoice_receipt', 1.5)).toThrow(RangeError)
  })
})
