import { describe, expect, it } from 'vitest'
import {
  NEWSLETTER_EMAIL_MAX,
  NEWSLETTER_FIELD_COPY,
  NEWSLETTER_FORM_COPY,
  checkNewsletterEmail,
} from './newsletter-form'

/**
 * UX12: the one address check both the browser and the server run. Pinned:
 * which slip gets which Hebrew sentence, that the passing address comes back
 * trimmed and lower-cased, and that every sentence a visitor can read is
 * Hebrew (the example address in one of them is the only Latin).
 */
describe('checkNewsletterEmail', () => {
  it('names an empty field, not a malformed one', () => {
    expect(checkNewsletterEmail('')).toEqual({ ok: false, error: NEWSLETTER_FIELD_COPY.empty })
    expect(checkNewsletterEmail('   ')).toEqual({ ok: false, error: NEWSLETTER_FIELD_COPY.empty })
    expect(checkNewsletterEmail(null)).toEqual({ ok: false, error: NEWSLETTER_FIELD_COPY.empty })
    expect(checkNewsletterEmail(undefined)).toEqual({
      ok: false,
      error: NEWSLETTER_FIELD_COPY.empty,
    })
  })

  it('tells a visitor who forgot the @ exactly that', () => {
    expect(checkNewsletterEmail('ofir.kenyonexpress.co.il')).toEqual({
      ok: false,
      error: NEWSLETTER_FIELD_COPY.noAt,
    })
  })

  it('refuses the shapes the browser lets through', () => {
    // `type="email"` accepts `ofir@kenyon` (measured 14.10): no dot, no TLD.
    for (const typed of ['ofir@kenyon', 'ofir@', '@kenyon.co.il', 'a@b.c', 'a@b..co', 'a b@c.co']) {
      expect(checkNewsletterEmail(typed), typed).toEqual({
        ok: false,
        error: NEWSLETTER_FIELD_COPY.invalid,
      })
    }
  })

  it('caps the length at the column size', () => {
    const local = 'a'.repeat(NEWSLETTER_EMAIL_MAX - 10)
    expect(checkNewsletterEmail(`${local}@kenyon.co.il`)).toEqual({
      ok: false,
      error: NEWSLETTER_FIELD_COPY.tooLong,
    })
  })

  it('normalises a passing address: trimmed and lower-cased', () => {
    expect(checkNewsletterEmail('  Dana@Example.COM ')).toEqual({
      ok: true,
      email: 'dana@example.com',
    })
    expect(checkNewsletterEmail('ofir@kenyonexpress.co.il')).toEqual({
      ok: true,
      email: 'ofir@kenyonexpress.co.il',
    })
    expect(checkNewsletterEmail('first.last+tag@sub.domain.io')).toEqual({
      ok: true,
      email: 'first.last+tag@sub.domain.io',
    })
  })

  it('answers in Hebrew everywhere a visitor reads', () => {
    const hebrew = /[א-ת]/
    for (const text of [
      ...Object.values(NEWSLETTER_FIELD_COPY),
      ...Object.values(NEWSLETTER_FORM_COPY),
    ]) {
      expect(text, text).toMatch(hebrew)
    }
  })
})
