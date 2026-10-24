import { describe, expect, it } from 'vitest'
import { buildPasswordResetEmail, buildSecurityAlertEmail } from './auth-emails'
import { buildVoucherExpiryEmail } from './expiry-reminders'
import { buildGiftEmail } from './gift-coupon'
import { buildOrderConfirmationEmail } from './purchase-confirmation'

/**
 * C20: Email template tests for all six required transactional emails.
 *
 * Tests verify:
 * 1. purchase_confirmation - 6-line format with dealer number 033798513
 * 2. password_reset - HTTPS validation
 * 3. expiry_t7 - 7 days remaining
 * 4. expiry_t1 - 1 day remaining
 * 5. security_alert - Auth event notifications
 * 6. gift_coupon - Gift delivery
 */

const SITE = 'https://kenyonexpress.co.il'

describe('C20: Six required transactional emails', () => {
  describe('1. purchase_confirmation - 6-line + dealer number 033798513', () => {
    it('includes dealer number 033798513 in both HTML and text', () => {
      const email = buildOrderConfirmationEmail({
        orderId: 'test-order-id',
        totalAgorot: 12900,
        siteUrl: SITE,
      })

      expect(email.html).toContain('033798513')
      expect(email.text).toContain('033798513')
      expect(email.html).toContain('קניון אקספרס')
      expect(email.text).toContain('קניון אקספרס')
    })

    it('has 6-line text format', () => {
      const email = buildOrderConfirmationEmail({
        orderId: 'test-order-id',
        orderRef: 'KE-1234',
        customerName: 'דנה',
        totalAgorot: 12900,
        siteUrl: SITE,
      })

      const lines = email.text.split('\n').filter((l) => l.trim())
      // Greeting, payment received, order number, total, link, legal line
      expect(lines.length).toBeGreaterThanOrEqual(6)
      expect(lines.length).toBeLessThanOrEqual(8) // Some optional lines
    })

    it('is RTL Hebrew with inline styles', () => {
      const email = buildOrderConfirmationEmail({
        orderId: 'test',
        totalAgorot: 100,
        siteUrl: SITE,
      })

      expect(email.html).toContain('dir="rtl"')
      expect(email.html).toContain('style="')
      expect(email.subject).toMatch(/[א-ת]/)
    })
  })

  describe('2. password_reset - HTTPS validation', () => {
    it('accepts HTTPS URLs and includes link in output', () => {
      const url = 'https://kenyonexpress.co.il/auth/reset?token=abc123'
      const email = buildPasswordResetEmail({ resetUrl: url })

      expect(email).not.toBeNull()
      expect(email?.text).toContain(url)
      expect(email?.html).toContain(url)
    })

    it('rejects non-HTTPS URLs', () => {
      expect(buildPasswordResetEmail({ resetUrl: 'http://example.com/reset' })).toBeNull()
      expect(buildPasswordResetEmail({ resetUrl: 'javascript:alert(1)' })).toBeNull()
      expect(buildPasswordResetEmail({ resetUrl: 'ftp://example.com' })).toBeNull()
    })

    it('includes validity period in text', () => {
      const email = buildPasswordResetEmail({
        resetUrl: 'https://kenyonexpress.co.il/reset',
        validMinutes: 30,
      })

      expect(email?.text).toContain('30')
    })

    it('is RTL Hebrew', () => {
      const email = buildPasswordResetEmail({
        resetUrl: 'https://kenyonexpress.co.il/reset',
      })

      expect(email?.html).toContain('dir="rtl"')
      expect(email?.subject).toMatch(/[א-ת]/)
    })
  })

  describe('3 & 4. expiry_t7 and expiry_t1 - Scheduled reminders', () => {
    it('T-7: renders 7 days remaining', () => {
      const email = buildVoucherExpiryEmail({
        daysRemaining: 7,
        productName: 'ספא במלון',
        siteUrl: SITE,
      })

      expect(email).not.toBeNull()
      expect(email?.subject).toContain('7')
      expect(email?.text).toContain('7')
    })

    it('T-1: renders "מחר" for 1 day remaining', () => {
      const email = buildVoucherExpiryEmail({
        daysRemaining: 1,
        productName: 'ספא במלון',
        siteUrl: SITE,
      })

      expect(email).not.toBeNull()
      expect(email?.subject).toContain('מחר')
      expect(email?.text).toContain('מחר')
    })

    it('refuses to render without deadline', () => {
      expect(
        buildVoucherExpiryEmail({
          daysRemaining: 0,
          siteUrl: SITE,
        }),
      ).toBeNull()

      expect(
        buildVoucherExpiryEmail({
          daysRemaining: -1,
          siteUrl: SITE,
        }),
      ).toBeNull()
    })

    it('includes product name when provided', () => {
      const email = buildVoucherExpiryEmail({
        daysRemaining: 7,
        productName: 'עיסוי שוודי',
        siteUrl: SITE,
      })

      expect(email?.html).toContain('עיסוי שוודי')
      expect(email?.text).toContain('עיסוי שוודי')
    })
  })

  describe('5. security_alert - Auth events', () => {
    it('renders password_changed event', () => {
      const email = buildSecurityAlertEmail({
        event: 'password_changed',
        siteUrl: SITE,
      })

      expect(email.subject).toMatch(/[א-ת]/)
      expect(email.text).toContain('סיסמה')
    })

    it('renders email_changed event', () => {
      const email = buildSecurityAlertEmail({
        event: 'email_changed',
        siteUrl: SITE,
      })

      expect(email.subject).toMatch(/[א-ת]/)
      expect(email.text).toContain('מייל')
    })

    it('renders new_sign_in event', () => {
      const email = buildSecurityAlertEmail({
        event: 'new_sign_in',
        siteUrl: SITE,
      })

      expect(email.subject).toMatch(/[א-ת]/)
      expect(email.text).toContain('התחברות')
    })

    it('never includes IP address or tokens', () => {
      const email = buildSecurityAlertEmail({
        event: 'password_changed',
        occurredAt: '2026-10-24T12:00:00Z',
        siteUrl: SITE,
      })

      // Should not contain IP address pattern
      expect(email.text).not.toMatch(/\d+\.\d+\.\d+\.\d+/)
      expect(email.html).not.toMatch(/\d+\.\d+\.\d+\.\d+/)

      // Should not contain token-like strings
      expect(email.text).not.toMatch(/[a-f0-9]{32,}/)
    })

    it('includes account security link', () => {
      const email = buildSecurityAlertEmail({
        event: 'password_changed',
        siteUrl: SITE,
      })

      expect(email.text).toContain(`${SITE}/account/security`)
      expect(email.html).toContain(`${SITE}/account/security`)
    })
  })

  describe('6. gift_coupon - Gift delivery', () => {
    it('includes claim token in link but not in subject', () => {
      const email = buildGiftEmail({
        productName: 'ארוחה זוגית',
        claimToken: 'SECRET_TOKEN_123',
        siteUrl: SITE,
      })

      expect(email.text).toContain('SECRET_TOKEN_123')
      expect(email.html).toContain('SECRET_TOKEN_123')
      expect(email.subject).not.toContain('SECRET_TOKEN_123')
    })

    it('includes product name', () => {
      const email = buildGiftEmail({
        productName: 'ספא במלון דן',
        claimToken: 'tok123',
        siteUrl: SITE,
      })

      expect(email.html).toContain('ספא במלון דן')
      expect(email.text).toContain('ספא במלון דן')
    })

    it('includes sender name when provided', () => {
      const email = buildGiftEmail({
        productName: 'עיסוי',
        senderName: 'דנה',
        claimToken: 'tok123',
        siteUrl: SITE,
      })

      expect(email.html).toContain('דנה')
    })

    it('is RTL Hebrew', () => {
      const email = buildGiftEmail({
        productName: 'מתנה',
        claimToken: 'tok',
        siteUrl: SITE,
      })

      expect(email.html).toContain('dir="rtl"')
      expect(email.subject).toMatch(/[א-ת]/)
    })
  })

  describe('Common requirements across all templates', () => {
    const emails = [
      buildOrderConfirmationEmail({ orderId: 'x', totalAgorot: 100, siteUrl: SITE }),
      buildPasswordResetEmail({ resetUrl: `${SITE}/reset` })!,
      buildSecurityAlertEmail({ event: 'password_changed', siteUrl: SITE }),
      buildVoucherExpiryEmail({ daysRemaining: 7, siteUrl: SITE })!,
      buildGiftEmail({ productName: 'x', claimToken: 'x', siteUrl: SITE }),
    ]

    it('all templates use RTL Hebrew', () => {
      for (const email of emails) {
        expect(email.html).toContain('dir="rtl"')
        expect(email.subject).toMatch(/[א-ת]/)
      }
    })

    it('all templates use inline styles (no <style> blocks)', () => {
      for (const email of emails) {
        expect(email.html).toContain('style="')
        expect(email.html).not.toContain('<style')
      }
    })

    it('all templates include plain-text alternatives', () => {
      for (const email of emails) {
        expect(email.text.trim().length).toBeGreaterThan(20)
      }
    })

    it('all templates have Hebrew subjects', () => {
      for (const email of emails) {
        expect(email.subject).toMatch(/[א-ת]/)
      }
    })
  })
})
