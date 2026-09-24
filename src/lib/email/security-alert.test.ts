import { describe, expect, it } from 'vitest'
import { SECURITY_EVENTS, buildSecurityAlertEmail } from './security-alert'

const AT = '2026-09-25T08:15:00Z'

describe('buildSecurityAlertEmail', () => {
  it('renders every event right-to-left with a headline that says what changed', () => {
    for (const event of SECURITY_EVENTS) {
      const mail = buildSecurityAlertEmail({ event, at: AT })
      expect(mail.subject, event).toContain('התראת אבטחה')
      expect(mail.html, event).toContain('dir="rtl"')
      expect(mail.text, event).toContain('אם זה לא הייתם אתם')
    }
  })

  it('names the change in words the customer used, not the mechanism', () => {
    expect(buildSecurityAlertEmail({ event: 'password_changed', at: AT }).subject).toContain(
      'הסיסמה שלך שונתה',
    )
    expect(buildSecurityAlertEmail({ event: 'passkey_removed', at: AT }).text).toContain(
      'מפתח כניסה הוסר',
    )
    expect(buildSecurityAlertEmail({ event: 'totp_enabled', at: AT }).text).toContain(
      'אימות דו-שלבי',
    )
  })

  it('carries no link at all, and says so', () => {
    // "Your account changed, click here" is the shape of every phishing mail.
    // The site address is printed as text for the reader to type.
    const mail = buildSecurityAlertEmail({
      event: 'passkey_added',
      at: AT,
      siteUrl: 'https://kenyonexpress.co.il/',
    })
    expect(mail.html).not.toContain('<a ')
    expect(mail.html).not.toContain('href=')
    expect(mail.text).toContain('אין קישור בכוונה')
    expect(mail.text).toContain('https://kenyonexpress.co.il')
    expect(mail.text).not.toContain('.co.il/')
  })

  it('prints the time in Hebrew in Israel time and never the words Invalid Date', () => {
    const mail = buildSecurityAlertEmail({ event: 'password_changed', at: AT })
    expect(mail.text).toContain('מתי: ')
    expect(mail.text).toContain('2026')
    expect(mail.text).not.toContain('Invalid Date')

    const broken = buildSecurityAlertEmail({ event: 'password_changed', at: 'not a date' })
    expect(broken.text).not.toContain('Invalid Date')
    expect(broken.text).not.toContain('מתי:')
  })
})
