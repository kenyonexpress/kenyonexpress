import { LTR_ISOLATE_STYLE, RTL_ISOLATE_STYLE, ltrText } from '@/lib/email/bidi'
import { formatDateTime } from '@/lib/i18n/format'
import { t } from '@/lib/i18n/messages'
import { OFF_PAGE } from '@/styles/tokens'

/**
 * The security alert: "something about how you sign in just changed".
 *
 * One of the five customer mails on the owner's list (Q09, 25.09.2026), and
 * the one whose whole value is in reaching the customer who did NOT do the
 * thing. So it is sent for the events that change who can get into the
 * account, and for nothing else: a password change, a second factor
 * enrolled, a passkey added, a passkey removed. A sign-in is not on the
 * list -- a mail on every login is the mail people learn to delete, and the
 * one that matters would be deleted with it.
 *
 * NOT AN OUTBOX KIND, on purpose. `notification_outbox_kind_check` would
 * reject it until a migration lands, and a security alert that waits for a
 * migration is not an alert. `server/auth/security-alert-send.ts` calls
 * `sendEmail` directly, the way the magic link does, best-effort and never
 * throwing: the change has already happened by the time this runs, and a
 * mail provider being down must not roll it back or fail the action.
 *
 * NO LINK TO CLICK. Every phishing mail is "your account changed, click
 * here". This one says what changed, when, and that the customer should sign
 * in through the site they know if it was not them. The site address is
 * printed as text, not as a button.
 *
 * Copy lives in `messages/he.json` under `securityAlert.*`. Same shape as
 * every builder here: a subject and two bodies, no transport.
 */

const {
  brand: BRAND,
  ink: INK,
  muted: MUTED,
  rule: RULE,
  paper: PAPER,
  panelWarm: PANEL_WARM,
} = OFF_PAGE

export type SecurityEvent =
  | 'password_changed'
  | 'totp_enabled'
  | 'passkey_added'
  | 'passkey_removed'

export const SECURITY_EVENTS: readonly SecurityEvent[] = [
  'password_changed',
  'totp_enabled',
  'passkey_added',
  'passkey_removed',
]

export interface SecurityAlertInput {
  event: SecurityEvent
  /** ISO timestamp of the change. Formatted in Hebrew; never printed raw. */
  at: string
  /** Site name shown to the reader; the sender identity, not a link. */
  siteName?: string
  /** Printed as text so the reader can compare it with the address bar. */
  siteUrl?: string
}

export interface BuiltSecurityAlert {
  subject: string
  html: string
  text: string
}

function eventCopy(event: SecurityEvent): { headline: string; sentence: string } {
  switch (event) {
    case 'password_changed':
      return {
        headline: t('securityAlert.passwordChangedHeadline'),
        sentence: t('securityAlert.passwordChangedSentence'),
      }
    case 'totp_enabled':
      return {
        headline: t('securityAlert.totpEnabledHeadline'),
        sentence: t('securityAlert.totpEnabledSentence'),
      }
    case 'passkey_added':
      return {
        headline: t('securityAlert.passkeyAddedHeadline'),
        sentence: t('securityAlert.passkeyAddedSentence'),
      }
    case 'passkey_removed':
      return {
        headline: t('securityAlert.passkeyRemovedHeadline'),
        sentence: t('securityAlert.passkeyRemovedSentence'),
      }
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function buildSecurityAlertEmail(input: SecurityAlertInput): BuiltSecurityAlert {
  const site = input.siteName ?? 'KenyonExpress'
  const address = (input.siteUrl ?? 'https://kenyonexpress.co.il').replace(/\/+$/, '')
  const copy = eventCopy(input.event)
  // `formatDateTime` answers '' for a broken value, never `Invalid Date`.
  const when = formatDateTime(input.at)

  const subject = `${t('securityAlert.subjectPrefix')} ${copy.headline}`
  const whenLine = when ? `${t('securityAlert.whenLabel')} ${when}` : ''
  const ifYou = t('securityAlert.ifYou')
  const notYou = t('securityAlert.ifNotYou')
  const noLink = t('securityAlert.noLink')

  const text = [
    t('securityAlert.greeting'),
    '',
    copy.sentence,
    whenLine,
    '',
    ifYou,
    notYou,
    '',
    `${noLink} ${ltrText(address)}`,
  ]
    .filter((line) => line !== '')
    .join('\n')

  const html = `
    <div dir="rtl" style="${RTL_ISOLATE_STYLE};background:${PANEL_WARM};padding:24px 12px;font-family:Heebo,Arial,Helvetica,sans-serif">
      <div style="max-width:560px;margin:0 auto">
        <div style="font-size:20px;font-weight:800;color:${INK};margin-bottom:16px">${escapeHtml(site)}</div>
        <div dir="rtl" style="${RTL_ISOLATE_STYLE};background:${PAPER};border:1px solid ${RULE};border-top:4px solid ${BRAND};border-radius:14px;padding:22px">
          <div style="font-size:18px;font-weight:700;color:${INK}">${escapeHtml(copy.headline)}</div>
          <div style="font-size:14px;color:${INK};margin-top:10px">${escapeHtml(copy.sentence)}</div>
          ${when ? `<div style="font-size:13px;color:${MUTED};margin-top:4px">${escapeHtml(whenLine)}</div>` : ''}
          <div style="font-size:14px;color:${INK};margin-top:14px">${escapeHtml(ifYou)}</div>
          <div style="font-size:14px;color:${INK};margin-top:6px">${escapeHtml(notYou)}</div>
          <div style="font-size:13px;color:${MUTED};margin-top:14px">${escapeHtml(noLink)}</div>
          <div dir="ltr" style="${LTR_ISOLATE_STYLE};font-size:13px;color:${INK};margin-top:4px;font-weight:700">${escapeHtml(address)}</div>
        </div>
        <div style="font-size:12px;color:${MUTED};margin-top:18px;text-align:center">${escapeHtml(t('securityAlert.footer'))}</div>
      </div>
    </div>`

  return { subject, html, text }
}
