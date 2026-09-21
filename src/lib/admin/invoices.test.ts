import { describe, expect, it } from 'vitest'
import { canRequeueInvoice, parseInvoiceSearch } from './invoices'

describe('canRequeueInvoice', () => {
  it('allows the queue states and refuses an issued document', () => {
    expect(canRequeueInvoice('failed')).toBe(true)
    expect(canRequeueInvoice('dead')).toBe(true)
    expect(canRequeueInvoice('pending')).toBe(true)
    expect(canRequeueInvoice('issued')).toBe(false)
    expect(canRequeueInvoice('anything')).toBe(false)
  })
})

describe('parseInvoiceSearch', () => {
  it('classifies an order id, an address and a document fragment', () => {
    expect(parseInvoiceSearch('6B0D520A-6D56-4251-B2B7-DDDF25A9F732')).toEqual({
      kind: 'order',
      value: '6b0d520a-6d56-4251-b2b7-dddf25a9f732',
    })
    expect(parseInvoiceSearch(' Dana@Example.com ')).toEqual({
      kind: 'email',
      value: 'dana@example.com',
    })
    expect(parseInvoiceSearch('mock-doc-3')).toEqual({ kind: 'document', value: 'mock-doc-3' })
    expect(parseInvoiceSearch('   ')).toEqual({ kind: 'none' })
    expect(parseInvoiceSearch(undefined)).toEqual({ kind: 'none' })
  })
})
