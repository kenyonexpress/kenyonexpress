import { LTR_ISOLATE_STYLE, RTL_ISOLATE_STYLE, ltrText } from '@/lib/email/bidi'

/**
 * The magic-link login mail, sent through Resend instead of Supabase's SMTP.
 *
 * Why it exists at all: every other mail this system sends is branded, Hebrew
 * and RTL, and the one mail a customer must trust the most, the one that logs
 * them in, was arriving as Supabase's default English template from a
 * different sender. A login mail that looks nothing like the shop it logs into
 * is indistinguishable from phishing, which trains customers to click exactly
 * the mails they should not.
 *
 * Same shape as `notifications.ts`: a pure builder, no transport, no network,
 * so the copy is directly testable. The sending half lives in the auth action;
 * the link itself comes from `auth.admin.generateLink`, and this builder never
 * sees a token, only the finished URL.
 *
 * WHAT THE COPY MUST DO. Say who sent it before anything else, say the link is
 * personal and short-lived, and say that an unrequested mail is safely
 * ignored. It must NOT carry any other link besides the login link: a login
 * mail with a marketing footer is a template for a convincing forgery.
 */

/* Kept in lockstep with notifications.ts; brand-colour.test.ts guards the hex. */
const BRAND = '#fed700'
const INK = '#1a1a1a'
const MUTED = '#6b7280'

export interface MagicLinkEmailInput {
  /** The full verification URL. Interpolated escaped, never trimmed or rebuilt. */
  actionLink: string
  /** Site name shown to the reader; the sender identity, not a link. */
  siteName?: string
}

export interface BuiltMagicLinkEmail {
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

export function buildMagicLinkEmail(input: MagicLinkEmailInput): BuiltMagicLinkEmail {
  const site = input.siteName ?? 'KenyonExpress'
  const link = input.actionLink
  const subject = `הקישור שלך לכניסה ל-${site}`

  const text = [
    'שלום,',
    '',
    `ביקשתם להתחבר ל-${site}. הכניסה בלחיצה על הקישור:`,
    ltrText(link),
    '',
    'הקישור אישי, חד פעמי, ותקף לזמן קצר.',
    'אם לא ביקשתם להתחבר, אפשר להתעלם מהמייל הזה ושום דבר לא ישתנה בחשבון.',
  ].join('\n')

  const html = `
    <div dir="rtl" style="${RTL_ISOLATE_STYLE};background:#f5f5f5;padding:24px 12px;font-family:Heebo,Arial,Helvetica,sans-serif">
      <div style="max-width:560px;margin:0 auto">
        <div style="font-size:20px;font-weight:800;color:${INK};margin-bottom:16px">${escapeHtml(site)}</div>
        <div dir="rtl" style="${RTL_ISOLATE_STYLE};background:#ffffff;border:1px solid #e5e7eb;border-radius:14px;padding:22px">
          <div style="font-size:18px;font-weight:700;color:${INK}">כניסה לחשבון שלך</div>
          <div style="font-size:14px;color:${INK};margin-top:10px">ביקשתם להתחבר ל-${escapeHtml(site)}. הכניסה בלחיצה אחת:</div>
          <a href="${escapeHtml(link)}" style="display:block;margin-top:18px;background:${BRAND};color:${INK};text-decoration:none;text-align:center;font-weight:700;padding:13px 18px;border-radius:10px">כניסה לחשבון</a>
          <div style="font-size:13px;color:${MUTED};margin-top:14px">אם הכפתור לא עובד, אפשר להעתיק את הקישור:</div>
          <div dir="ltr" style="${LTR_ISOLATE_STYLE};font-size:12px;color:${MUTED};margin-top:6px;word-break:break-all">${escapeHtml(link)}</div>
          <div style="font-size:13px;color:${MUTED};margin-top:14px">הקישור אישי, חד פעמי, ותקף לזמן קצר.</div>
        </div>
        <div style="font-size:12px;color:${MUTED};margin-top:18px;text-align:center">אם לא ביקשתם להתחבר, אפשר להתעלם מהמייל הזה ושום דבר לא ישתנה בחשבון.</div>
      </div>
    </div>`

  return { subject, html, text }
}
