import type { BuiltEmail } from '@/lib/email/voucher-email'

export interface SupplierVerificationEmailInput {
  businessName: string
  verificationUrl: string
}

export function buildSupplierVerificationEmail(input: SupplierVerificationEmailInput): BuiltEmail {
  const { businessName, verificationUrl } = input

  const subject = `אימות אימייל - ${businessName} | Kenyon Express`

  const html = `
<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: system-ui, -apple-system, sans-serif; background-color: #f9fafb; direction: rtl;">
  <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
    <div style="background-color: #ffffff; border-radius: 12px; padding: 32px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
      <div style="text-align: center; margin-bottom: 24px;">
        <h1 style="color: #111827; font-size: 24px; margin: 0 0 8px 0;">אימות כתובת אימייל</h1>
        <p style="color: #6b7280; font-size: 14px; margin: 0;">Kenyon Express - פורטל ספקים</p>
      </div>

      <div style="color: #374151; font-size: 15px; line-height: 1.6; margin-bottom: 24px;">
        <p style="margin: 0 0 16px 0;">שלום,</p>

        <p style="margin: 0 0 16px 0;">
          תודה על הגשת הבקשה להצטרפות כספק ל-Kenyon Express עבור <strong>${businessName}</strong>.
        </p>

        <p style="margin: 0 0 16px 0;">
          כדי להמשיך בתהליך, אנא אמת/י את כתובת האימייל שלך על ידי לחיצה על הכפתור למטה:
        </p>

        <div style="text-align: center; margin: 32px 0;">
          <a href="${verificationUrl}"
             style="display: inline-block; background-color: #fbbf24; color: #78350f; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 16px;">
            אימות כתובת אימייל
          </a>
        </div>

        <p style="margin: 0 0 16px 0; color: #6b7280; font-size: 13px;">
          או העתק והדבק את הקישור הבא בדפדפן:
        </p>
        <p style="margin: 0 0 16px 0; color: #3b82f6; font-size: 13px; word-break: break-all;">
          ${verificationUrl}
        </p>

        <div style="background-color: #dbeafe; border-right: 4px solid #3b82f6; padding: 16px; margin: 24px 0; border-radius: 6px;">
          <p style="margin: 0; color: #1e40af; font-size: 14px;">
            <strong>מה קורה אחר כך?</strong><br>
            לאחר אימות האימייל, הבקשה שלך תועבר לבדיקה על ידי הצוות שלנו.<br>
            נעדכן אותך בתוצאות תוך 2-3 ימי עסקים.
          </p>
        </div>

        <p style="margin: 0 0 8px 0; color: #9ca3af; font-size: 12px;">
          קישור האימות תקף ל-48 שעות.
        </p>
        <p style="margin: 0; color: #9ca3af; font-size: 12px;">
          אם לא ביקשת להצטרף כספק, ניתן להתעלם ממייל זה.
        </p>
      </div>

      <div style="border-top: 1px solid #e5e7eb; padding-top: 20px; margin-top: 24px; text-align: center; color: #9ca3af; font-size: 12px;">
        <p style="margin: 0 0 8px 0;">Kenyon Express</p>
        <p style="margin: 0;">פלטפורמת הקניות המובילה</p>
      </div>
    </div>
  </div>
</body>
</html>
`.trim()

  const text = `
אימות כתובת אימייל - Kenyon Express

שלום,

תודה על הגשת הבקשה להצטרפות כספק ל-Kenyon Express עבור ${businessName}.

כדי להמשיך בתהליך, אנא אמת/י את כתובת האימייל שלך על ידי ביקור בקישור הבא:

${verificationUrl}

מה קורה אחר כך?
לאחר אימות האימייל, הבקשה שלך תועבר לבדיקה על ידי הצוות שלנו.
נעדכן אותך בתוצאות תוך 2-3 ימי עסקים.

קישור האימות תקף ל-48 שעות.
אם לא ביקשת להצטרף כספק, ניתן להתעלם ממייל זה.

---
Kenyon Express
פלטפורמת הקניות המובילה
`.trim()

  return { subject, html, text }
}
