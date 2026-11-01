import { LRI, LTR_ISOLATE_STYLE, PDI, RTL_ISOLATE_STYLE, ltrText } from '@/lib/email/bidi'
import { buildNotification } from '@/lib/email/notifications'
import { describe, expect, it } from 'vitest'

describe('ltrText', () => {
  it('wraps a token in a real LRI…PDI isolate pair', () => {
    expect(ltrText('KE-1234')).toBe(`${LRI}KE-1234${PDI}`)
    expect(LRI).toBe('⁦')
    expect(PDI).toBe('⁩')
  })

  it('keeps the wrapped value findable as a plain substring', () => {
    // The guarantee every existing test relies on: isolation surrounds, it
    // never intersperses, so `toContain(url)` and copy-paste both still work.
    expect(ltrText('https://kenyonexpress.co.il/account/orders')).toContain(
      'https://kenyonexpress.co.il/account/orders',
    )
  })

  it('returns the empty string unwrapped, so blank-line filters still fire', () => {
    expect(ltrText('')).toBe('')
  })
})

describe('the email bidi contract', () => {
  it('pairs direction with unicode-bidi in both style constants', () => {
    // dir attributes get stripped by some mail clients; inline styles survive.
    // A constant that carries only one of the two silently regresses those
    // clients, so the pairing is the tested fact.
    expect(LTR_ISOLATE_STYLE).toContain('direction:ltr')
    expect(LTR_ISOLATE_STYLE).toContain('unicode-bidi:isolate')
    expect(RTL_ISOLATE_STYLE).toContain('direction:rtl')
    expect(RTL_ISOLATE_STYLE).toContain('unicode-bidi:isolate')
  })

  it('renders every customer-facing notification with rtl direction and unicode-bidi', () => {
    const payload: Record<string, unknown> = {
      order_id: '11111111-2222-3333-4444-555555555555',
      order_ref: 'ORDER1',
      total_agorot: 5000,
      item_count: 1,
      refunded_agorot: 12500,
      cancellation_fee_agorot: 0,
      full_name: 'דנה',
      customer_name: 'דנה',
    }
    for (const kind of ['order_paid', 'order_shipped', 'refund_completed', 'welcome']) {
      const mail = buildNotification(kind, payload, 'https://kenyonexpress.co.il')
      expect(mail, `no mail for ${kind}`).not.toBeNull()
      expect(mail?.html, `${kind} html lost dir="rtl"`).toContain('dir="rtl"')
      expect(mail?.html, `${kind} html lost unicode-bidi`).toContain('unicode-bidi:isolate')
      expect(mail?.html, `${kind} html lost direction:rtl`).toContain('direction:rtl')
    }
  })

  it('isolates the order ref in the plain-text bodies', () => {
    const payload = { order_ref: 'ORDER1', total_agorot: 5000, item_count: 1 }
    for (const kind of ['order_paid', 'order_shipped']) {
      const mail = buildNotification(kind, payload, 'https://kenyonexpress.co.il')
      expect(mail?.text, `${kind} text ref not isolated`).toContain(`${LRI}ORDER1${PDI}`)
    }
  })
})
