import { formatAgorot } from '@/lib/vouchers/coupon-view'
import { describe, expect, it } from 'vitest'
import { buildInvoiceEmail } from './invoice-email'

/**
 * The envelope a tax document travels in. Pure, so what the customer reads
 * is asserted directly: the number and the order reference in the subject,
 * the attachment's name, the link back to the owner-checked route rather
 * than to any public file, and escaping of whatever the customer typed as
 * their name.
 */

const ORDER_ID = '11111111-1111-4111-8111-111111111111'

function input(overrides: Partial<Parameters<typeof buildInvoiceEmail>[0]> = {}) {
  return {
    customerName: 'דנה כהן',
    documentType: 'tax_invoice_receipt' as const,
    documentNumber: 'KE-INV-000042',
    orderId: ORDER_ID,
    totalAgorot: 9_000,
    siteUrl: 'https://kenyonexpress.co.il/',
    ...overrides,
  }
}

describe('buildInvoiceEmail', () => {
  it('names the document, its number and the order in the subject', () => {
    const built = buildInvoiceEmail(input())
    expect(built.subject).toBe('חשבונית מס/קבלה KE-INV-000042 · הזמנה 11111111')
  })

  it('attaches under the printed number only', () => {
    expect(buildInvoiceEmail(input()).attachmentFileName).toBe('KE-INV-000042.pdf')
  })

  it('links to the owner-checked route, never to a file URL, and strips the trailing slash', () => {
    const built = buildInvoiceEmail(input())
    const link = `https://kenyonexpress.co.il/account/orders/${ORDER_ID}/invoice`
    expect(built.text).toContain(link)
    expect(built.html).toContain(`href="${link}"`)
    expect(built.html).not.toContain('kenyonexpress.co.il//')
  })

  it('states the amount through the one shekel formatter, in agorot in and shekels out', () => {
    const built = buildInvoiceEmail(input())
    expect(built.text).toContain(`סכום: ${formatAgorot(9_000)}`)
    expect(built.html).toContain(formatAgorot(9_000))
  })

  it('greets by name and escapes it in the HTML body', () => {
    const built = buildInvoiceEmail(input({ customerName: '<b>דנה</b>' }))
    expect(built.text.startsWith('שלום <b>דנה</b>,')).toBe(true)
    expect(built.html).toContain('שלום &lt;b&gt;דנה&lt;/b&gt;,')
    expect(built.html).not.toContain('<b>דנה</b>')
    expect(buildInvoiceEmail(input({ customerName: '  ' })).text.startsWith('שלום,')).toBe(true)
  })

  it('describes each document type in its own words', () => {
    expect(buildInvoiceEmail(input({ documentType: 'coupon_receipt' })).text).toContain(
      'הקבלה על התשלום מראש',
    )
    const credit = buildInvoiceEmail(
      input({ documentType: 'credit_note', documentNumber: 'KE-CRN-000001' }),
    )
    expect(credit.subject.startsWith('חשבונית זיכוי KE-CRN-000001')).toBe(true)
    expect(credit.text).toContain('סכום הזיכוי:')
  })

  it('says it is a computerized document and asks the customer to keep the file', () => {
    const built = buildInvoiceEmail(input())
    expect(built.text).toContain('מסמך ממוחשב')
    expect(built.html).toContain('KE-INV-000042.pdf')
  })
})
