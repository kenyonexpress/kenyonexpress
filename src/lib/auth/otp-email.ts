import { t } from '@/lib/i18n/messages'
import { OFF_PAGE } from '@/styles/tokens'

/**
 * The mail that carries a six-digit sign-in code, for the email leg of the S19
 * code form (the fallback when WhatsApp Cloud is not configured).
 *
 * Lives beside the other auth helpers rather than in `lib/email`, because it
 * has one caller and that caller is the sign-in action. The code is digits
 * only (the action checks /^\d{6}$/ on the way back), so interpolating it into
 * HTML needs no escaping.
 */
export function buildOtpEmail(code: string): { subject: string; html: string; text: string } {
  const subject = t('otpEmail.subject').replace('{code}', code)
  const lead = t('otpEmail.lead')
  const note = t('otpEmail.note')
  const signature = t('otpEmail.signature')
  const text = [`${lead} ${code}`, '', note, '', signature].join('\n')
  const html = `<!doctype html>
<html lang="he" dir="rtl">
  <body style="margin:0;padding:24px;background:${OFF_PAGE.panelWarm};font-family:Heebo,Arial,sans-serif;color:${OFF_PAGE.ink}">
    <div style="max-width:480px;margin:0 auto;background:${OFF_PAGE.paper};border-radius:12px;padding:24px;text-align:right">
      <p style="margin:0 0 12px;font-size:16px">${lead}</p>
      <p dir="ltr" style="margin:0 0 16px;font-size:32px;font-weight:700;letter-spacing:8px;text-align:center">${code}</p>
      <p style="margin:0;font-size:13px;color:${OFF_PAGE.muted}">${note}</p>
      <p style="margin:16px 0 0;font-size:13px;color:${OFF_PAGE.muted}">${signature}</p>
    </div>
  </body>
</html>`
  return { subject, html, text }
}
