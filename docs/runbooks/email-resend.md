# ‏Runbook: דואר יוצא (‏Resend)

| שדה | ערך |
| --- | --- |
| רכיב | ‏`notification_outbox`, תבניות ב-`src/lib/email`, אימות דומיין |
| ספק | ‏Resend (‏`RESEND_API_KEY`, ‏`RESEND_FROM`, ‏`RESEND_AUDIENCE_ID`) |
| כרטיס ב-/admin/health | `email` (קריאה אמיתית ל-`GET /domains`, לא רק קיום מפתח) |
| כונן | אופיר |
| חומרה ברירת מחדל | ‏SEV2: לקוח ששילם לא מקבל את השובר במייל. ‏SEV1 אם מייל שגוי יוצא בהמוניו |
| סולם הסלמה | ‏`README.md` §סולם ההסלמה |

## 1. רדיוס פגיעה

מייל השובר אחרי רכישה, איפוס סיסמה, ‏OTP במייל, תזכורות תפוגה, ‏digest שבועי,
עגלה נטושה. **שום רכישה לא נחסמת**: השליחה היא דרך ‏outbox אסינכרוני, ההזמנה
והשובר קיימים גם כשהמייל לא יצא. השובר מופיע באזור האישי בלי תלות במייל.

## 2. זיהוי

- ‏`/admin/health`: ‏`email` ‏`down` (‏401/403 מ-Resend: המפתח נדחה).
- ‏`notification_outbox` עם ‏`pending` שמתיישן (היה ‏72 שורות מ-10.09 כשה-cron
  נדחה ב-401; זו הייתה תקרית ‏scheduler, לא ‏Resend).
- ‏Resend Dashboard: ‏bounces, ‏complaints, דומיין שאיבד אימות.
- פנייה "שילמתי ולא קיבלתי מייל".

## 3. טריאז'

```sql
select status, count(*), min(created_at)
from notification_outbox
group by status;
```

1. **‏pending מצטבר, ‏health ‏`ok`?** ה-cron ‏`notifications` (כל ‏5 דקות) לא
   רץ או נדחה: ‏`scheduler-cron.md` §3. זה המקרה השכיח.
2. **‏`email` ‏`down`?** המפתח נדחה או הדומיין לא מאומת. ‏Resend Dashboard >
   Domains. אם ‏DNS של הדומיין נפל, גם רשומות ‏DKIM/SPF נפלו: ‏`dns-domain.md`.
3. **מייל שגוי יצא?** (סכום שגוי, לינק שבור, שפה הפוכה): ‏§4 צעד ‏1 מיד,
   ואז לאסוף את ‏`id` של השורות שנשלחו מהחלון הרלוונטי.
4. **‏`KILL_SWITCH_NOTIFICATIONS` דולק מאתמול?** זה הסבר מלא ל"שקט"; השורות
   נרשמו ולא נשלחו.

## 4. צעדי Rollback

1. **עצירה**: ‏`KILL_SWITCH_NOTIFICATIONS=1` ב-Vercel ו-redeploy. מייל ו-push
   נדלגים, האירוע עדיין נרשם ב-outbox, כלום לא אובד.
2. **תבנית שגויה**: ‏rollback של האפליקציה (‏`web-vercel.md` §4). השורות
   שעדיין ‏pending יישלחו עם התבנית הישנה בניקוז הבא.
3. **מפתח דלף או נדחה**: ‏`SECRETS-ROTATION.md` §"Resend": מפתח חדש ב-Resend,
   ‏`RESEND_API_KEY` ב-Vercel, ‏redeploy, מפתח ישן מבוטל אחרון.
4. **ניקוז אחרי התקרית**: להסיר את המתג, ‏redeploy, ואז ‏`notifications`
   ו-`email-retry` ינקזו לבד; ידנית עם ה-bearer:

```bash
curl -sS -H "Authorization: Bearer $CRON_SECRET" https://kenyonexpress.co.il/api/cron/notifications
```

5. **מייל שיצא בטעות ללקוחות**: אין ‏recall. מייל תיקון הוא החלטת תוכן של
   אופיר, לא של הכונן.

## 5. מה לא ניתן להחזיר

- מייל שנשלח.
- מוניטין שליחה: ‏bounce rate גבוה אצל ‏Resend משפיע על כל המיילים הבאים.
  לא לנקז ‏outbox ישן (ימים) בלי לסנן תחילה כתובות שחזרו.

## 6. מתי להסלים

- רוטציית ‏`RESEND_API_KEY` ושינוי רשומות ‏DNS של הדומיין: אופיר.
- מייל שגוי שיצא ללקוחות אמיתיים: ‏SEV1, מיידי, לפני הניקוז.
- ‏outbox מעל ‏24 שעות ‏pending: ‏SEV2, אופיר מודע גם אם הסיבה ידועה.

## 7. אימות אחרי

‏`/admin/health` ‏`email` ‏`ok`; השאילתה מ-§3 מראה ‏`pending` יורד בין שתי
ריצות ‏cron; מייל בדיקה אחד לכתובת פנימית דרך ‏`pnpm telegram:verify` לא
רלוונטי, המקבילה למייל היא איפוס סיסמה למשתמש בדיקה.

## 8. מסמכים קשורים

‏`../ARCHITECTURE-NOTIFICATIONS-V2.md`, ‏`../RUNBOOK.md` §"Kill switches",
‏`../SECRETS-ROTATION.md`, ‏`../OPERATIONS-CALENDAR.md`, ‏`scheduler-cron.md`.
