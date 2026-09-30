import { LTR_ISOLATE_STYLE, RTL_ISOLATE_STYLE, ltrText } from '@/lib/email/bidi'
import { escapeHtml, renderEmailDocument } from '@/lib/email/layout'
import { OFF_PAGE } from '@/styles/tokens'

/**
 * The branded password-reset mail.
 *
 * A sibling of `magic-link.ts` and deliberately not a flag on it: the two
 * mails answer different questions ("come in" versus "you asked to change
 * the way you come in"), and the reset one has to say, in its own words, that
 * nothing changes if the reader ignores it, because a reset mail somebody did
 * not request is the first thing an account-takeover attempt looks like from
 * the victim's side.
 *
 * Until STEP 16 this mail was Supabase's default English template from a
 * different sender: the one mail that asks a customer to change a credential
 * looked nothing like the shop. The link is OURS,
 * `/auth/callback?token_hash=…&type=recovery&next=/reset-password`, verified
 * server-side by the callback with `verifyOtp`, for the reason
 * `server/auth/magic-link-send.ts` gives about GoTrue's `action_link`.
 *
 * Same shape as every other builder: pure, no transport, no network. It
 * carries exactly one link. A reset mail with a second link is a template for
 * a convincing forgery.
 */

const { brand: BRAND, ink: INK, muted: MUTED, rule: RULE, paper: PAPER } = OFF_PAGE

export interface PasswordResetEmailInput {
  /** The full verification URL. Interpolated escaped, never trimmed or rebuilt. */
  actionLink: string
  /** Site name shown to the reader; the sender identity, not a link. */
  siteName?: string
}

export interface BuiltPasswordResetEmail {
  subject: string
  html: string
  text: string
}

const SHORT_LIVED = 'הקישור אישי, חד פעמי, ותקף לזמן קצר.'
const IGNORE =
  'אם לא ביקשתם לאפס את הסיסמה, אפשר להתעלם מהמייל הזה. הסיסמה הנוכחית נשארת בתוקף ושום דבר לא ישתנה בחשבון.'

export function buildPasswordResetEmail(input: PasswordResetEmailInput): BuiltPasswordResetEmail {
  const site = input.siteName ?? 'KenyonExpress'
  const link = input.actionLink
  const subject = `איפוס סיסמה ל-${site}`

  const text = [
    'שלום,',
    '',
    `ביקשתם לאפס את הסיסמה לחשבון שלכם ב-${site}. לבחירת סיסמה חדשה:`,
    ltrText(link),
    '',
    SHORT_LIVED,
    IGNORE,
  ].join('\n')

  const html = renderEmailDocument({
    siteName: site,
    title: subject,
    preheader: subject,
    bodyHtml: `<div dir="rtl" class="ke-card" style="${RTL_ISOLATE_STYLE};background:${PAPER};border:1px solid ${RULE};border-radius:14px;padding:22px">
          <div style="font-size:18px;font-weight:700;color:${INK}">איפוס סיסמה</div>
          <div style="font-size:14px;color:${INK};margin-top:10px">ביקשתם לאפס את הסיסמה לחשבון שלכם ב-${escapeHtml(site)}. לבחירת סיסמה חדשה:</div>
          <a href="${escapeHtml(link)}" class="ke-btn" style="display:block;margin-top:18px;background:${BRAND};color:${INK};text-decoration:none;text-align:center;font-weight:700;padding:13px 18px;border-radius:10px">לבחירת סיסמה חדשה</a>
          <div style="font-size:13px;color:${MUTED};margin-top:14px">אם הכפתור לא עובד, אפשר להעתיק את הקישור:</div>
          <div dir="ltr" style="${LTR_ISOLATE_STYLE};font-size:12px;color:${MUTED};margin-top:6px;word-break:break-all">${escapeHtml(link)}</div>
          <div style="font-size:13px;color:${MUTED};margin-top:14px">${escapeHtml(SHORT_LIVED)}</div>
        </div>`,
    footer: IGNORE,
  })

  return { subject, html, text }
}
