# ‏Runbook: ניטור והתראות (‏Sentry, ‏PostHog, ‏UptimeRobot, ‏ntfy, טלגרם)

| שדה | ערך |
| --- | --- |
| רכיב | שגיאות (‏Sentry), אירועי מוצר (‏PostHog), מוניטור חיצוני (‏UptimeRobot), ערוצי הדיווח (‏ntfy, טלגרם), ‏`/admin/health` ויומן ‏`health_incidents` |
| ספק | ‏Sentry, ‏PostHog, ‏UptimeRobot, ‏ntfy.sh, ‏Telegram |
| כרטיס ב-/admin/health | אין (זה הדף שמציג את הכרטיסים; הוא עצמו נמדד מבחוץ) |
| כונן | אופיר |
| חומרה ברירת מחדל | ‏SEV3 כשהניטור בלבד שבור. **אבל**: ניטור עיוור הופך כל תקרית אחרת ל-SEV גבוה יותר |
| סולם הסלמה | ‏`README.md` §סולם ההסלמה |

## 1. רדיוס פגיעה

אף לקוח לא נפגע ישירות. הפגיעה היא **בזמן הגילוי** של תקריות אחרות:
‏UptimeRobot הוא היחיד שרואה ‏Vercel או ‏DNS למטה (ה-cron רץ על ה-deploy
שהוא בודק); ‏ntfy וטלגרם הם הדרך היחידה שבה אופיר שומע על ‏`stranded-payments`.

## 2. זיהוי

- **שקט חשוד**: אף ‏page ב-24 שעות בזמן שיש תנועה.
- ‏Sentry: ‏release נשאר ‏sha ישן אחרי ‏deploy (נמדד ‏09.10: ‏`1e84df0`
  במקום ‏HEAD); ‏source maps לא עולים כי ‏`SENTRY_AUTH_TOKEN` של ‏Production
  נדחה ‏401 מאז ‏06.10. **רוב האירועים הם מחשבים מקומיים**; לסנן
  ‏`environment=production` לפני כל מסקנה.
- ‏PostHog: ‏captures נזרקים תחת אוטומציה (‏webdriver, ‏HeadlessChrome); ספירות
  אפס מ-E2E הן תקינות. בפרודקשן נמדד: ‏`purchase`, ‏`begin_checkout`,
  ‏`voucher_redeemed`, ‏`order_refunded` החזירו ‏0 שורות עד שתוקן.
- ‏UptimeRobot: ‏`/api/alerts/uptimerobot` עונה ‏401 כש-`UPTIMEROBOT_WEBHOOK_SECRET`
  לא מוגדר ב-deploy, וההתראה נבלעת.
- ‏`/admin/health`: "המיגרציה ‏269 ממתינה" במקום יומן תקריות הוא מצב ידוע,
  לא תקלה.

## 3. טריאז'

```bash
curl -sS -d "בדיקת ערוץ, התעלם" ntfy.sh/kenyon-ofir-limit     # הטלפון מצלצל?
pnpm telegram:verify                                        # הודעה שקטה אחת
curl -sS -o /dev/null -w '%{http_code}\n' https://kenyonexpress.co.il/api/alerts/uptimerobot   # 401 = מוגן, לא 404
```

1. **ntfy לא מגיע?** ‏ntfy.sh בתקלה או האפליקציה בטלפון כבויה. טלגרם הוא
   הגיבוי; ‏`sendAlert` מדווח ‏delivered כשאחד מהם קיבל.
2. **‏Sentry ריק אחרי ‏deploy?** ‏`SENTRY_DSN` הוסר, או ‏CSP חוסם את ה-ingest.
   ‏`src/__tests__/sentry-build-config.test.ts` מחזיק את הקונפיגורציה.
3. **‏PostHog ריק?** המפתח, ה-`NEXT_PUBLIC_POSTHOG_HOST`, או ‏consent: לפני
   מדידה לקבוע ‏`ke_consent`.
4. **‏UptimeRobot שותק ו-`/api/health` ‏200?** המוניטור הושהה או הסוד שונה;
   ‏`pnpm uptime:setup:dry` מראה את המצב בלי לשנות.

## 4. צעדי Rollback

ניטור אין לו "גרסה קודמת"; ה-rollback הוא השבתה או הפעלה מחדש של ערוץ.

1. **‏Sentry שולח יותר מדי / ‏PII**: להסיר ‏`SENTRY_DSN` מ-Production ו-redeploy;
   האפליקציה שותקת ולא נשברת. ‏`SENTRY_DEBUG_ROUTES` לכבות אם הופעל.
2. **‏PostHog מקליט משהו שלא צריך**: להסיר ‏`NEXT_PUBLIC_POSTHOG_KEY` ו-redeploy
   (‏`NEXT_PUBLIC_*` נאפה ב-build). ה-SDK לא נטען בלי מפתח.
3. **סוד ‏UptimeRobot דלף**: ‏`openssl rand -hex 24`, לעדכן ‏`UPTIMEROBOT_WEBHOOK_SECRET`
   ב-Vercel, ‏redeploy, ואז ‏`pnpm uptime:setup` עם ‏`UPTIMEROBOT_API_KEY` של
   החשבון (אצל אופיר).
4. **טלגרם שולח לצ'אט הלא נכון**: להסיר ‏`TELEGRAM_CHAT_ID`; ‏ntfy ממשיך לבד.
5. **‏`SENTRY_AUTH_TOKEN` נדחה**: טוקן חדש ב-Sentry > Settings > Auth Tokens
   עם ‏`project:releases` ו-`org:read`, ל-Vercel ‏Production, ‏redeploy. בלעדיו
   ה-build ירוק ורק ה-source maps חסרים.

## 5. מה לא ניתן להחזיר

- אירועים שלא נאספו בזמן שהערוץ היה כבוי.
- ‏page שלא נשלח: תקרית שנגלתה מאוחר כבר קרתה.
- מכסת ‏Sentry שנשרפה מ-loop של שגיאות (‏rate limit בפרויקט ‏Sentry עדיף על
  הסרת ‏DSN).

## 6. מתי להסלים

- כל טוקן או מפתח של ‏Sentry, ‏PostHog, ‏UptimeRobot, הבוט בטלגרם: חשבונות
  של אופיר.
- שני ערוצי ההתראה מתים יחד: ‏SEV2 מיידי, כי כל ‏SEV1 הבא יישאר שקט.
- החלה של ‏269 (יומן התקריות): מצב קבוע, אישור.

## 7. אימות אחרי

הודעת בדיקה אחת מגיעה לטלפון דרך ‏ntfy **ו**-דרך טלגרם; ‏Sentry מראה אירוע
אחד עם ‏release של ‏HEAD; ‏UptimeRobot ‏`up` ובדיקת ‏webhook מהלוח שלו מופיעה
ב-ntfy; ‏`/admin/health` נטען ו-`/api/cron/health` עונה ‏401 בלי ‏bearer.

## 8. מסמכים קשורים

‏`../RUNBOOK.md` §1, ‏`../ARCHITECTURE-OBSERVABILITY.md`, ‏`../SENTRY-SETUP.md`,
‏`../ANALYTICS-EVENTS.md`, ‏`src/lib/health/`, ‏`migrations/pending/269_health_incidents.sql`.
