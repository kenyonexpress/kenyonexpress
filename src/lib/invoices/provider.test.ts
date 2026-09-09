import { agorot } from '@/lib/money'
import type { CreateDocumentInput } from '@/lib/payments/types'
import { describe, expect, it, vi } from 'vitest'
import {
  DOCUMENT_PROVIDER_IDS,
  greenInvoiceProvider,
  icountProvider,
  mockDocumentProvider,
  resolveDocumentProviderId,
  selectDocumentProvider,
} from './provider'

const request = (over: Partial<CreateDocumentInput> = {}): CreateDocumentInput => ({
  documentType: 'tax_invoice_receipt',
  customerName: 'דנה',
  customerEmail: 'dana@example.com',
  customerPhone: null,
  lines: [],
  totalAgorot: agorot(11_800),
  vatPercent: 18,
  transactionId: 'tx-1',
  reference: 'AB12CD34',
  sendByEmail: true,
  ...over,
})

describe('choosing a provider', () => {
  it('defaults to cardcom, which is what the code did before there was a choice', () => {
    expect(resolveDocumentProviderId({} as NodeJS.ProcessEnv)).toBe('cardcom')
    expect(resolveDocumentProviderId({ INVOICE_PROVIDER: '  ' } as never)).toBe('cardcom')
  })

  it('accepts each id it advertises', () => {
    for (const id of DOCUMENT_PROVIDER_IDS) {
      expect(resolveDocumentProviderId({ INVOICE_PROVIDER: id } as never)).toBe(id)
    }
  })

  it('throws on an unrecognised value instead of falling back', () => {
    // The direction matters. A fallback means a typo sends every tax document
    // to the wrong company, and the symptom is invoices piling up in an account
    // nobody is watching.
    expect(() => resolveDocumentProviderId({ INVOICE_PROVIDER: 'greeninvoice' } as never)).toThrow(
      /INVOICE_PROVIDER/,
    )
  })
})

describe('building the selected provider', () => {
  it('does not construct the cardcom adapter unless cardcom is selected', () => {
    // `getPaymentProvider` reads terminal credentials. Building it eagerly
    // would make INVOICE_PROVIDER=green_invoice fail on a missing PAYMENT key,
    // which is an error message pointing at the wrong system entirely.
    const build = vi.fn(() => ({ createDocument: vi.fn() }))
    selectDocumentProvider(build, { INVOICE_PROVIDER: 'green_invoice' } as never)
    expect(build).not.toHaveBeenCalled()
  })

  it('routes to cardcom by delegating, without requiring it to grow an id', () => {
    const createDocument = vi.fn(async () => ({
      success: true,
      documentNumber: '12345',
      documentUrl: null,
      failureCode: null,
      failureMessage: null,
      raw: {},
    }))
    const provider = selectDocumentProvider(() => ({ createDocument }), {} as never)
    expect(provider.id).toBe('cardcom')
    return provider.createDocument(request()).then((result) => {
      expect(createDocument).toHaveBeenCalledOnce()
      expect(result.documentNumber).toBe('12345')
    })
  })
})

describe('the stubs refuse rather than pretend', () => {
  it.each([
    ['green_invoice', greenInvoiceProvider],
    ['icount', icountProvider],
  ])('%s returns a refusal naming what it needs', async (_id, provider) => {
    // A client written against documentation nobody has opened looks finished
    // and fails on the first real call -- and the first real call is a
    // customer's tax receipt. The refusal lands in `invoices.last_error`, where
    // an operator will read it, and the queue retries rather than dying.
    const result = await provider.createDocument(request())
    expect(result.success).toBe(false)
    expect(result.failureCode).toBe('provider_not_implemented')
    expect(result.failureMessage).toMatch(/טרם חובר/)
    expect(result.documentNumber).toBeNull()
  })
})

describe('the mock', () => {
  it('returns a number that could never be mistaken for a real one', async () => {
    // This project runs against the HOSTED database, so a stray mock run stamps
    // whatever this returns onto a live order as its invoice number. A
    // plausible number is the one thing it must never produce.
    const result = await mockDocumentProvider.createDocument(request())
    expect(result.documentNumber).toBe('mock-doc-AB12CD34')
    expect(result.documentNumber).toMatch(/^mock-/)
    expect(result.documentNumber).not.toMatch(/^\d+$/)
  })
})
