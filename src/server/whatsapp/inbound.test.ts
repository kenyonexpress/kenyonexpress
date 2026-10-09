import { describe, expect, it } from 'vitest'
import { classifyInbound, waPhoneDigits } from './inbound'

describe('classifyInbound', () => {
  it('recognizes the Hebrew and English opt-out keywords', () => {
    for (const body of ['הסר', 'הסרה', 'להסיר', 'הסירו אותי', 'STOP', 'stop', 'Unsubscribe']) {
      expect(classifyInbound(body)).toBe('opt_out')
    }
  })

  it('recognizes the opt-in keywords', () => {
    for (const body of ['הצטרפות', 'הרשמה', 'START', 'join', 'אישור']) {
      expect(classifyInbound(body)).toBe('opt_in')
    }
  })

  it('forgives whitespace and trailing punctuation around a keyword', () => {
    expect(classifyInbound('  הסר!  ')).toBe('opt_out')
    expect(classifyInbound('STOP.')).toBe('opt_out')
    expect(classifyInbound('הצטרפות!!!')).toBe('opt_in')
  })

  it('recognizes the order-status keywords', () => {
    for (const body of ['סטטוס', 'סטטוס הזמנה', 'איפה ההזמנה שלי', 'מה עם ההזמנה', 'STATUS']) {
      expect(classifyInbound(body)).toBe('order_status')
    }
  })

  it('recognizes the refund keywords', () => {
    for (const body of ['זיכוי', 'החזר כספי', 'בקשת זיכוי', 'ביטול הזמנה', 'Refund']) {
      expect(classifyInbound(body)).toBe('refund_request')
    }
  })

  it('bare ביטול is ambiguous between order and channel, so it reaches a human', () => {
    expect(classifyInbound('ביטול')).toBe('message')
  })

  it('English cancel stays the platform opt-out, not a refund request', () => {
    // Twilio enforces STOP/CANCEL at the platform level before we see it;
    // classifying it as refund would fight that.
    expect(classifyInbound('cancel')).toBe('opt_out')
  })

  it('treats a keyword inside a sentence as a support message, not consent', () => {
    // "I want to stop my order" must reach a human, not cut the channel.
    expect(classifyInbound('אני רוצה לבטל את ההזמנה, תעזרו לי')).toBe('message')
    expect(classifyInbound('please stop charging me for order 123')).toBe('message')
    expect(classifyInbound('מתי ההזמנה שלי מגיעה?')).toBe('message')
  })

  it('treats an empty body as a message', () => {
    expect(classifyInbound('')).toBe('message')
  })
})

describe('waPhoneDigits', () => {
  it('strips the whatsapp: scheme and normalizes to international digits', () => {
    expect(waPhoneDigits('whatsapp:+972501234567')).toBe('972501234567')
    expect(waPhoneDigits('whatsapp:+9720501234567')).toBe('972501234567')
  })

  it('returns null for a number the flow cannot key on', () => {
    expect(waPhoneDigits('whatsapp:+14155238886')).toBeNull()
    expect(waPhoneDigits('')).toBeNull()
  })
})
