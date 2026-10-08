# ‏Runbook: הודעות (‏Twilio, ‏WhatsApp ו-SMS)

| שדה | ערך |
| --- | --- |
| רכיב | ‏OTP בטלפון להתחברות, הודעות ‏WhatsApp על שובר שהונפק ועומד לפוג, ‏SMS |
| ספק | ‏Twilio, חשבון אחד (‏`TWILIO_ACCOUNT_SID` / ‏`TWILIO_AUTH_TOKEN`), שולחים נפרדים ‏`TWILIO_WHATSAPP_FROM` ו-`TWILIO_SMS_FROM` |
| כרטיס ב-/admin/health | `twilio` (קריאה אמיתית ל-`GET /Accounts/{sid}.json`; חשבון שאינו active הוא ‏`down`) |
| כונן | אופיר |
| חומרה ברירת מחדל | ‏SEV3. ‏SEV2 אם ‏OTP בטלפון הוא הדרך היחידה של לקוחות להיכנס |
| סולם הסלמה | ‏`README.md` §סולם ההסלמה |

## 1. רדיוס פגיעה

התחברות בטלפון (‏`src/lib/auth/phone-otp.ts`): כשהספק לא זמין, הטופס מציג
"שליחת ‏SMS אינה זמינה כרגע" ומסך ההתחברות במייל ממשיך לעבוד. הודעות ‏WhatsApp
יוצאות דרך ה-cron ‏`whatsapp` (כל ‏5 דקות) מתור משלהן, ולכן נדחות ולא אובדות.
שום רכישה או פדיון לא תלויים ברכיב.

## 2. זיהוי

- ‏`/admin/health`: ‏`twilio` ‏`down` ("נדחה" על ‏401/403, או חשבון מושעה).
- ‏Twilio Console: ‏Monitor > Logs > Errors (‏30007 סינון תוכן, ‏63016 תבנית
  ‏WhatsApp לא מאושרת, ‏21610 מספר שביקש הסרה).
- פניות "לא מגיע קוד".
- ‏cron ‏`whatsapp` אדום ב-`gh run list --workflow=cron.yml`.

## 3. טריאז'

1. **חשבון מושעה או יתרה שנגמרה?** ‏Twilio Console > Billing. זה המקרה
   הסביר בחשבון קטן; רק אופיר יכול לטעון.
2. **‏OTP לא מגיע למספר ישראלי מסוים?** ‏Twilio Logs לפי המספר. ‏30007 או
   ‏30034 הם רישום ‏A2P/sender, לא באג.
3. **כל ההודעות נכשלות עם ‏401?** הטוקן סובב ולא עודכן ב-Vercel: ‏`secrets.md`.
4. **‏WhatsApp נכשל ו-SMS עובד?** תבנית ‏Content (‏`TWILIO_CONTENT_SID_VOUCHER_ISSUED`
   / ‏`_EXPIRING`) נדחתה או פגה ב-Meta. ‏SMS ממשיך; ‏WhatsApp ממתין.

## 4. צעדי Rollback

1. **להוריד את הערוץ בלי קוד**: להסיר ‏`TWILIO_WHATSAPP_FROM` (רק ‏WhatsApp) או
   ‏`TWILIO_SMS_FROM` (רק ‏SMS) מ-Production ו-redeploy. הבדיקה ב-`checks.ts`
   מדווחת ‏`not_configured` לערוץ שהוסר, לא ‏`down`, וההתחברות נופלת למייל.
2. **כל ‏Twilio**: להסיר גם ‏`TWILIO_ACCOUNT_SID` ו-`TWILIO_AUTH_TOKEN`.
   התור של ‏WhatsApp נשמר ומנוקז כשהערכים חוזרים.
3. **טוקן דלף**: ‏Twilio Console > Account > API keys & tokens > Secondary
   token, החלפה ב-Vercel, ‏redeploy, ביטול הראשי אחרון.
4. **תבנית שגויה יצאה**: אין ‏recall ב-WhatsApp. להסיר את ה-`CONTENT_SID`
   השגוי ולהמתין לאישור תבנית מתוקנת ב-Meta (ימים, לא דקות).

## 5. מה לא ניתן להחזיר

- הודעה שנשלחה.
- ‏OTP שפג (‏TTL קצר בכוונה; לשלוח חדש, לא "להאריך").
- מספר שביקש הסרה (‏STOP): ‏Twilio חוסם אותו עד שהלקוח כותב ‏START.

## 6. מתי להסלים

- טעינת יתרה, רישום ‏sender, תבניות ‏WhatsApp: חשבון ‏Twilio של אופיר.
- רוטציית טוקן: אופיר.
- ‏OTP בטלפון למטה מעל שעה כשזו דרך הכניסה של רוב הלקוחות: ‏SEV2.

## 7. אימות אחרי

‏`/admin/health` ‏`twilio` ‏`ok`; ‏OTP אחד למספר בדיקה; הודעת ‏WhatsApp אחת
מהתור (‏cron ‏`whatsapp` ירוק ב-run הבא).

## 8. מסמכים קשורים

‏`../ARCHITECTURE-NOTIFICATIONS-V2.md`, ‏`src/lib/sms/twilio.ts`,
‏`src/lib/whatsapp/twilio.ts`, ‏`src/lib/auth/phone-otp.ts`, ‏`auth-supabase.md`.
