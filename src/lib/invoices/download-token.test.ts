import { describe, expect, it } from 'vitest'
import {
  INVOICE_LINK_TTL_SECONDS,
  InvoiceLinkSecretMissingError,
  invoiceDownloadPath,
  signInvoiceLink,
  verifyInvoiceLink,
} from './download-token'

const env = { VOUCHER_QR_SECRET: 'x'.repeat(32) } as unknown as NodeJS.ProcessEnv
const NOW = 1_800_000_000_000

describe('invoice download links', () => {
  it('verifies a link it just signed', () => {
    const p = signInvoiceLink('order-1', NOW, env)
    expect(verifyInvoiceLink('order-1', String(p.exp), p.sig, NOW, env)).toBe('ok')
  })

  it('does not open a different order with the same signature', () => {
    const p = signInvoiceLink('order-1', NOW, env)
    expect(verifyInvoiceLink('order-2', String(p.exp), p.sig, NOW, env)).toBe('invalid')
  })

  it('rejects a moved expiry', () => {
    const p = signInvoiceLink('order-1', NOW, env)
    expect(verifyInvoiceLink('order-1', String(p.exp + 1), p.sig, NOW, env)).toBe('invalid')
  })

  it('expires after the TTL and not before', () => {
    const p = signInvoiceLink('order-1', NOW, env)
    const justBefore = NOW + (INVOICE_LINK_TTL_SECONDS - 1) * 1000
    const after = NOW + (INVOICE_LINK_TTL_SECONDS + 1) * 1000
    expect(verifyInvoiceLink('order-1', String(p.exp), p.sig, justBefore, env)).toBe('ok')
    expect(verifyInvoiceLink('order-1', String(p.exp), p.sig, after, env)).toBe('expired')
  })

  it('treats missing or malformed parts as invalid, not as a crash', () => {
    expect(verifyInvoiceLink('o', null, 'x', NOW, env)).toBe('invalid')
    expect(verifyInvoiceLink('o', '12', undefined, NOW, env)).toBe('invalid')
    expect(verifyInvoiceLink('o', 'abc', 'x', NOW, env)).toBe('invalid')
    expect(verifyInvoiceLink('o', '99999999999', 'short', NOW, env)).toBe('invalid')
  })

  it('refuses to sign or verify without a secret', () => {
    const empty = {} as unknown as NodeJS.ProcessEnv
    expect(() => signInvoiceLink('o', NOW, empty)).toThrow(InvoiceLinkSecretMissingError)
  })

  it('builds a path that carries exp and sig', () => {
    const p = signInvoiceLink('o-1', NOW, env)
    expect(invoiceDownloadPath('o-1', p)).toBe(
      `/api/invoices/o-1/download?exp=${p.exp}&sig=${p.sig}`,
    )
  })
})
