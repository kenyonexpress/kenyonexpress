import type { BuiltEmail } from '@/lib/email/voucher-email'
import { OFF_PAGE } from '@/styles/tokens'

/**
 * Account-security templates: password reset and security alert.
 *
 * Unlike the outbox-backed templates these are self-contained: they are sent
 * straight to the transport, never queued, because a reset link must not sit
 * in a table waiting for a drain and a token must not be persisted in a
 * payload column.
 *
 * NEVER ECHO WHAT AN ATTACKER WOULD WANT. The alert names the event, the time
 * and what to do; it carries no IP address, no token and no password hint.
 * The reset mail's only secret is the link itself, which the caller built.
 * Links must be https, otherwise the builder returns null.
 */

const {
  brand: BRAND,
  ink: INK,
  muted: MUTED,
  rule: RULE,
  panelWarm: PANEL_WARM,
  paper: PAPER,
} = OFF_PAGE

function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function isHttps(url: string): boolean {
  try {
    return new URL(url).protocol === 'https:'
  } catch {
    return false
  }
}

function wrap(body: string, footer: string): string {
  return `
    <div dir="rtl" style="background:${PANEL_WARM};padding:24px 12px;font-family:Heebo,Arial,Helvetica,sans-serif">
      <div style="max-width:560px;margin:0 auto">
        <div style="font-size:20px;font-weight:800;color:${INK};margin-bottom:16px">KenyonExpress</div>
        <div dir="rtl" style="background:${PAPER};border:1px solid ${RULE};border-radius:14px;padding:22px">${body}</div>
        <div style="font-size:12px;color:${MUTED};margin-top:18px;text-align:center">${esc(footer)}</div>
      </div>
    </div>`
}

export interface PasswordResetInput {
  fullName?: string | null
  /** The full https reset link, built by the caller from the auth token. */
  resetUrl: string
  /** Link lifetime in minutes, stated in the mail. Defaults to 60. */
  validMinutes?: number
}

export function buildPasswordResetEmail(input: PasswordResetInput): BuiltEmail | null {
  if (!isHttps(input.resetUrl)) return null
  const minutes = Math.max(1, Math.round(input.validMinutes ?? 60))
  const name = input.fullName?.trim()
  const greeting = name ? `שלום ${name},` : 'שלום,'
  const subject = 'איפוס סיסמה ל-KenyonExpress'
  const validity = `הקישור תקף ל-${minutes} דקות ולשימוש חד-פעמי.`
  const ignore = 'לא ביקשתם לאפס סיסמה? אפשר להתעלם מהמייל, הסיסמה לא תשתנה.'

  const text = [
    greeting,
    '',
    'התקבלה בקשה לאפס את הסיסמה לחשבון שלך. לבחירת סיסמה חדשה:',
    input.resetUrl,
    '',
    validity,
    ignore,
  ].join('\n')

  const html = wrap(
    `<div style="font-size:18px;font-weight:700;color:${INK}">${esc(subject)}</div>
        <div style="font-size:15px;color:${INK};margin-top:10px">${esc(greeting)} התקבלה בקשה לאפס את הסיסמה לחשבון שלך.</div>
        <a href="${esc(input.resetUrl)}" style="display:block;margin-top:18px;background:${BRAND};color:${INK};text-decoration:none;text-align:center;font-weight:700;padding:13px 18px;border-radius:10px">בחירת סיסמה חדשה</a>
        <div style="font-size:13px;color:${MUTED};margin-top:12px">${esc(validity)}</div>
        <div style="font-size:13px;color:${MUTED};margin-top:6px">${esc(ignore)}</div>`,
    'קיבלת את המייל הזה כי התבקש איפוס סיסמה לחשבון ב-KenyonExpress.',
  )
  return { subject, html, text }
}

type SecurityEventKind = 'password_changed' | 'email_changed' | 'new_sign_in'

const EVENT_COPY: Record<SecurityEventKind, { subject: string; line: string }> = {
  password_changed: {
    subject: 'הסיסמה בחשבון שלך שונתה',
    line: 'הסיסמה בחשבון שלך ב-KenyonExpress שונתה.',
  },
  email_changed: {
    subject: 'כתובת המייל בחשבון שלך שונתה',
    line: 'כתובת המייל בחשבון שלך ב-KenyonExpress שונתה.',
  },
  new_sign_in: {
    subject: 'התחברות חדשה לחשבון שלך',
    line: 'זוהתה התחברות חדשה לחשבון שלך ב-KenyonExpress.',
  },
}

export interface SecurityAlertInput {
  event: SecurityEventKind
  fullName?: string | null
  /** ISO timestamp of the event. Rendered in Hebrew; omitted if unparseable. */
  occurredAt?: string | null
  /** Origin with no trailing slash, e.g. https://kenyonexpress.co.il */
  siteUrl: string
}

export function buildSecurityAlertEmail(input: SecurityAlertInput): BuiltEmail {
  const copy = EVENT_COPY[input.event]
  const site = input.siteUrl.replace(/\/+$/, '')
  const name = input.fullName?.trim()
  const greeting = name ? `שלום ${name},` : 'שלום,'
  const when = input.occurredAt ? new Date(input.occurredAt) : null
  const whenText =
    when && !Number.isNaN(when.getTime())
      ? when.toLocaleString('he-IL', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })
      : ''
  const action = 'אם זה לא היית אתה, אפסו את הסיסמה מיד ופנו אלינו.'
  const url = `${site}/account/security`

  const text = [greeting, '', copy.line, whenText ? `מתי: ${whenText}` : '', '', action, url]
    .filter((line) => line !== '')
    .join('\n')

  const html = wrap(
    `<div style="font-size:18px;font-weight:700;color:${INK}">${esc(copy.subject)}</div>
        <div style="font-size:15px;color:${INK};margin-top:10px">${esc(greeting)} ${esc(copy.line)}</div>
        ${whenText ? `<div style="font-size:13px;color:${MUTED};margin-top:8px">${esc(whenText)}</div>` : ''}
        <div style="font-size:14px;color:${INK};margin-top:14px">${esc(action)}</div>
        <a href="${esc(url)}" style="display:block;margin-top:18px;background:${BRAND};color:${INK};text-decoration:none;text-align:center;font-weight:700;padding:13px 18px;border-radius:10px">אבטחת החשבון</a>`,
    'קיבלת את המייל הזה כי זוהתה פעילות באבטחת החשבון שלך ב-KenyonExpress.',
  )
  return { subject: copy.subject, html, text }
}
