import { LTR_ISOLATE_STYLE, RTL_ISOLATE_STYLE, ltrText } from '@/lib/email/bidi'
import { t } from '@/lib/i18n/messages'
import { OFF_PAGE } from '@/styles/tokens'

/**
 * The branded password-reset mail.
 *
 * A sibling of `magic-link.ts` and deliberately not a flag on it: the two
 * mails answer different questions ("come in" versus "you asked to change
 * the way you come in"), and the reset one has to say, in its own words, that
 * nothing changes if the reader ignores it -- because a reset mail somebody
 * did not request is the first thing an account-takeover attempt looks like
 * from the victim's side.
 *
 * The link is OURS: `/auth/callback?token_hash=…&type=recovery&next=/reset-password`,
 * verified server-side by the callback with `verifyOtp`, for the reason
 * `server/auth/magic-link-send.ts` gives about GoTrue's `action_link`.
 *
 * Copy lives in `messages/he.json` under `passwordReset.*`.
 */

const {
  brand: BRAND,
  ink: INK,
  muted: MUTED,
  rule: RULE,
  paper: PAPER,
  panelWarm: PANEL_WARM,
} = OFF_PAGE

export interface PasswordResetEmailInput {
  /** The full verification URL. Interpolated escaped, never trimmed or rebuilt. */
  actionLink: string
  siteName?: string
}

export interface BuiltPasswordResetEmail {
  subject: string
  html: string
  text: string
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function buildPasswordResetEmail(input: PasswordResetEmailInput): BuiltPasswordResetEmail {
  const site = input.siteName ?? 'KenyonExpress'
  const link = input.actionLink
  const subject = `${t('passwordReset.subjectPrefix')}${site}`
  const ignore = t('passwordReset.ignore')
  const shortLived = t('passwordReset.shortLived')

  const text = [
    t('passwordReset.greeting'),
    '',
    `${t('passwordReset.introPrefix')}${site}${t('passwordReset.introSuffixText')}`,
    ltrText(link),
    '',
    shortLived,
    ignore,
  ].join('\n')

  const html = `
    <div dir="rtl" style="${RTL_ISOLATE_STYLE};background:${PANEL_WARM};padding:24px 12px;font-family:Heebo,Arial,Helvetica,sans-serif">
      <div style="max-width:560px;margin:0 auto">
        <div style="font-size:20px;font-weight:800;color:${INK};margin-bottom:16px">${escapeHtml(site)}</div>
        <div dir="rtl" style="${RTL_ISOLATE_STYLE};background:${PAPER};border:1px solid ${RULE};border-radius:14px;padding:22px">
          <div style="font-size:18px;font-weight:700;color:${INK}">${escapeHtml(t('passwordReset.headline'))}</div>
          <div style="font-size:14px;color:${INK};margin-top:10px">${escapeHtml(t('passwordReset.introPrefix'))}${escapeHtml(site)}${escapeHtml(t('passwordReset.introSuffixHtml'))}</div>
          <a href="${escapeHtml(link)}" style="display:block;margin-top:18px;background:${BRAND};color:${INK};text-decoration:none;text-align:center;font-weight:700;padding:13px 18px;border-radius:10px">${escapeHtml(t('passwordReset.cta'))}</a>
          <div style="font-size:13px;color:${MUTED};margin-top:14px">${escapeHtml(t('passwordReset.copyHint'))}</div>
          <div dir="ltr" style="${LTR_ISOLATE_STYLE};font-size:12px;color:${MUTED};margin-top:6px;word-break:break-all">${escapeHtml(link)}</div>
          <div style="font-size:13px;color:${MUTED};margin-top:14px">${escapeHtml(shortLived)}</div>
        </div>
        <div style="font-size:12px;color:${MUTED};margin-top:18px;text-align:center">${escapeHtml(ignore)}</div>
      </div>
    </div>`

  return { subject, html, text }
}
