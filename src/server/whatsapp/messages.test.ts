import { describe, expect, it } from 'vitest'
import { OPT_IN_REPLY, OPT_OUT_REPLY, buildWhatsAppText, ticketAckText } from './messages'

const PAYLOAD = {
  order_id: 'abcdef12-3456-7890-abcd-ef1234567890',
  order_ref: 'ABCDEF12',
  customer_name: 'דנה',
  total_agorot: 12345,
}

describe('buildWhatsAppText', () => {
  it('order_paid greets by name, cites the ref and formats agorot as shekels', () => {
    const text = buildWhatsAppText('order_paid', PAYLOAD)
    expect(text).toContain('שלום דנה,')
    expect(text).toContain('ABCDEF12')
    // 12345 agorot is 123.45 shekels; only the formatter renders it.
    expect(text).toContain('123.45')
    expect(text).not.toContain('12345')
  })

  it('every notification carries the opt-out line', () => {
    for (const kind of ['order_paid', 'order_fulfilled', 'order_cancelled', 'order_refunded']) {
      expect(buildWhatsAppText(kind, PAYLOAD)).toContain('הסר')
    }
  })

  it('order_refunded promises no date', () => {
    const text = buildWhatsAppText('order_refunded', PAYLOAD) ?? ''
    expect(text).toContain('זיכוי')
    expect(text).toContain('חברת האשראי')
    expect(text).not.toMatch(/ימי עסקים|תוך \d/)
  })

  it('falls back to the order id prefix when there is no ref, and to a plain greeting without a name', () => {
    const text = buildWhatsAppText('order_cancelled', {
      order_id: 'abcdef12-3456-7890-abcd-ef1234567890',
    })
    expect(text).toContain('שלום,')
    expect(text).toContain('ABCDEF12')
  })

  it('omits the total line when the payload carries no money', () => {
    const text = buildWhatsAppText('order_paid', { order_ref: 'ABCDEF12' }) ?? ''
    expect(text).not.toContain('סך ההזמנה')
  })

  it('returns null for a kind it cannot render, so the drain can park the row', () => {
    expect(buildWhatsAppText('order_shipped', PAYLOAD)).toBeNull()
    expect(buildWhatsAppText('', PAYLOAD)).toBeNull()
  })

  it('returns null when there is no ref at all: a message about nothing', () => {
    expect(buildWhatsAppText('order_paid', {})).toBeNull()
  })
})

describe('canned replies', () => {
  it('opt-out confirms and names the way back in', () => {
    expect(OPT_OUT_REPLY).toContain('הוסרתם')
    expect(OPT_OUT_REPLY).toContain('הצטרפות')
  })

  it('opt-in confirms and names the way out', () => {
    expect(OPT_IN_REPLY).toContain('הסר')
  })

  it('the ticket ack carries the ticket ref', () => {
    expect(ticketAckText('AB12CD34')).toContain('AB12CD34')
  })
})
