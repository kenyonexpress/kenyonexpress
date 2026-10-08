# ‏Runbooks לתקריות, רכיב-רכיב

‏נכתב ‏09.10.2026 (‏STEP 68). ‏12 רכיבים, קובץ לכל אחד, אותו מבנה בכולם, כדי
שמי שלא בנה את המערכת ימצא את צעד ה-rollback באותו מקום בכל קובץ. המסמכים
הוותיקים (‏`../RUNBOOK.md`, ‏`../INCIDENT-PLAYBOOKS.md`) מסודרים לפי **תסמין**;
אלה מסודרים לפי **רכיב**, ומפנים אליהם במקום להעתיק.

‏`src/__tests__/incident-runbooks-inventory.test.ts` מחזיק את מה שכתוב כאן:
כל קובץ מכיל את שמונת הסעיפים בסדר הזה, כל כרטיס ב-`/admin/health` שייך
ל-runbook אחד, כל עבודת ‏cron מופיעה ב-`scheduler-cron.md`, ואין קישור שבור.

## מי הכונן

| | |
| --- | --- |
| כונן קבוע | **אופיר.** אין סבב כוננות ואין אדם שני. כל "להסלים" במסמכים האלה פירושו אליו. |
| ערוץ ‏1, דחוף | ‏push לטלפון: ‏`curl -d "SEV1 <רכיב>: <משפט>" ntfy.sh/kenyon-ofir-limit` |
| ערוץ ‏2 | טלגרם, אותו צ'אט פרטי שה-pages מגיעים אליו (‏`TELEGRAM_BOT_TOKEN` + ‏`TELEGRAM_CHAT_ID`) |
| ערוץ ‏3 | טלפון. המספר לא נשמר בריפו בכוונה; הוא בטלפון של מי שמחזיק את הבוט. |
| מה לכתוב | רכיב, ‏SEV, מה נראה (פלט של הפקודות מ-§2 של ה-runbook), מה כבר נעשה, מה נדרש **ממנו** ולמה הכונן לא יכול לבד |

## רמות חומרה

| רמה | פירוש | דוגמאות | תגובה |
| --- | --- | --- | --- |
| ‏SEV1 | כסף או כל האתר | ‏checkout מחייב בלי הזמנה, ‏5xx בבית, ‏DNS מת, ‏RLS פתוח על טבלת כסף, ‏service key דלף | בלם קודם, אבחון אחר כך, אופיר מיד גם בלילה |
| ‏SEV2 | שירות מדורדר ללקוחות | מיילים לא יוצאים, אף אחד לא נכנס, ‏cron לא רץ יממה, תמונות שבורות | ‏rollback לפי ה-runbook, אופיר בבוקר אם לא נפתר תוך שעה |
| ‏SEV3 | פיצ'ר אחד או ניטור | חיפוש ריק, ‏WhatsApp מתעכב, ‏Sentry שקט | בתור, בלי ‏page |

## סולם ההסלמה

| דרג | מי | מה מותר לו | תקציב זמן |
| --- | --- | --- | --- |
| ‏0 | אוטומציה: ‏`auto-rollback.yml`, ‏`stranded-payments`, ‏`reconcile`, ‏UptimeRobot, ‏`backup-health.yml` | ‏rollback ל-deploy קודם (כשיש ‏`VERCEL_TOKEN`), ‏page | מיידי |
| ‏1 | הכונן או סוכן הקוד | כל צעד ב-§4 של ה-runbook שאינו ברשימה למטה: בלם ‏`CHECKOUT_ENABLED`, ‏kill switches, ‏rollback של האפליקציה, ‏replay של ‏webhook, הרצת ‏cron ידנית, ‏revert דרך ‏push לענף הפרודקשן | ‏SEV1: ‏15 דקות עד הבלם, ואז הסלמה. ‏SEV2: שעה. |
| ‏2 | אופיר | הכול, ובפרט הרשימה למטה | ‏SEV1 מיד, ‏SEV2 תוך יום עבודה |
| ‏3 | ספק, דרך אופיר בלבד | ‏Cardcom ‏03-9436100, ‏Supabase support, ‏Vercel support, הרשם של ‏`.co.il` | לפי הספק |

**מה עולה לדרג ‏2 תמיד**, גם כשהכונן יודע בדיוק מה לעשות:

1. ‏`deploy --prod` ידני ל-Vercel, או כל שינוי משתנה סביבה בפרודקשן.
2. מחיקת ‏DB, טבלה, ‏bucket, אובייקטים או קבצים.
3. הרצת מיגרציה בפרודקשן, כולל מיגרציית היפוך, כולל ‏`DISABLE TRIGGER`.
4. סוכן קוד שני על אותו ‏repo.
5. כל רוטציית סוד (כולם בחשבונות שלו).
6. ‏`amount_mismatch`, ‏`reconciliation_missing_remotely`, חיוב כפול, ‏RLS פתוח
   על ‏orders / ‏order_items / ‏payments / ‏vouchers / ‏wallet.
7. ‏DNS והרשם: אין צעד שם שאינו שלו.
8. החזרת בלם למצב פעיל (‏`CHECKOUT_ENABLED=true` אחרי תקרית).

## מבנה כל ‏runbook

טבלת מטא בראש (רכיב, ספק, כרטיס ב-`/admin/health`, כונן, חומרה), ואז שמונה
סעיפים ממוספרים, תמיד באותו סדר:

1. רדיוס פגיעה: מה נשבר ללקוח ומה **לא**.
2. זיהוי: מאיפה מגיעה ההתראה, ופקודה אחת לאימות.
3. טריאז': שלוש עד חמש הסתעפויות, כל אחת מפנה לצעד.
4. צעדי ‏Rollback: ממוספרים, הראשון הוא תמיד הבלם.
5. מה לא ניתן להחזיר.
6. מתי להסלים: מה עולה לאופיר ומה הולך לספק.
7. אימות אחרי: פקודות, לא תחושה.
8. מסמכים קשורים.

## הרכיבים

| ‏Runbook | רכיב | כרטיסים ב-`/admin/health` | ‏SEV ברירת מחדל |
| --- | --- | --- | --- |
| [web-vercel.md](web-vercel.md) | האפליקציה, ‏deploy, ‏rollback, מתגי כיבוי | `async_offload` | ‏SEV1 |
| [database-supabase.md](database-supabase.md) | ‏Postgres, ‏RLS, מיגרציות, שחזור | `database`, `read_replica` | ‏SEV1 |
| [payments-cardcom.md](payments-cardcom.md) | ‏checkout, ‏webhook, החזרים | `cardcom` | ‏SEV1 |
| [search-meilisearch.md](search-meilisearch.md) | חיפוש, ‏outbox של האינדקס | `search` | ‏SEV3 |
| [email-resend.md](email-resend.md) | מייל יוצא, ‏notification_outbox | `email` | ‏SEV2 |
| [messaging-twilio.md](messaging-twilio.md) | ‏OTP בטלפון, ‏WhatsApp, ‏SMS | `twilio` | ‏SEV3 |
| [storage-r2.md](storage-r2.md) | תמונות, ‏R2, ‏Supabase Storage | `storage` | ‏SEV2 |
| [scheduler-cron.md](scheduler-cron.md) | ‏30 עבודות ‏cron, ‏`CRON_SECRET` | `scheduler` | ‏SEV2 |
| [dns-domain.md](dns-domain.md) | דומיין, האצלת ‏NS, ‏TLS, ‏HSTS | אין | ‏SEV1 |
| [auth-supabase.md](auth-supabase.md) | התחברות, ‏OTP, ‏passkeys, מגביל קצב | `rate_limiter` | ‏SEV2 |
| [observability.md](observability.md) | ‏Sentry, ‏PostHog, ‏UptimeRobot, ‏ntfy, טלגרם | אין | ‏SEV3 |
| [secrets.md](secrets.md) | מפתח שדלף, רוטציה | אין | ‏SEV1 |

## חוקים שנשארים בתוקף גם בתקרית

- כסף הוא ‏integer באגורות דרך ‏`src/lib/money.ts`. גם תיקון ידני.
- אין ‏`db push`. אין מיגרציה מחוץ ל-`migrations/pending/` ובלי אישור.
- אין ‏`git push --force`, אין ‏`git commit -A`, אין ‏push ל-`main` בלי ‏PR.
- ‏Rollback של ‏Vercel מחזיר קוד ולא סכימה. אם מיגרציה כבר רצה, זו תקרית
  ‏DB ולא תקרית ‏deploy.
- ‏`ChargeToken` ו-`RefundDeal` לא מנוסים שוב. לעולם.
- לא להדפיס סוד ללוג, לצ'אט או ל-STATE.md. ‏URL ה-unblock של ‏push protection
  מפרסם את הסוד.

## אחרי התקרית

‏postmortem קצר ב-`../INCIDENT-PLAYBOOKS.md` או במסמך ‏`DNS-INCIDENT-*` דומה:
ציר זמן, מה זיהה, מה ה-rollback שעבד, ומה ב-runbook הזה היה חסר. אם
‏`health_incidents` חי (‏269), היומן שם הוא ציר הזמן.
