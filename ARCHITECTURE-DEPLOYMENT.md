# ARCHITECTURE-DEPLOYMENT

תאריך: 2026-07-24 (יום המיזוג). מסמך על: תשתית הפריסה של kenyonexpress.co.il.
גובר על `DEPLOYMENT.md` (שנכתב לפני המיזוג) בכל סתירה; `docs/DEPLOY.md` נשאר
מדריך הפקודות המעשי. אפס קוד במסמך הזה: הוא מתאר את מה שקיים בעץ.

## 1. טופולוגיה

| שכבה | ספק | הערות |
|---|---|---|
| Frontend + API routes | Vercel (Next.js App Router) | build מ-`phase5/homepage` |
| DB / Auth / Storage | Supabase | פרויקט יחיד; אין branches בפרודקשן |
| PSP | Cardcom | ה-client בעץ עובד מול ה-v11 JSON API |
| תמונות | Cloudflare R2 (fallback: Supabase Storage) | presigned PUT מהשרת בלבד |
| חיפוש | Meilisearch (fallback: Postgres LIKE) | אופציונלי, שלושת המשתנים יחד |
| התראות | Supabase Trigger + Edge Function + Resend | הנתיב היחיד המותר במודל המחייב |

## 2. משתני סביבה

הרשימה הקנונית המלאה, כולל חובה/אופציונלי/tooling, נמצאת ב-`.env.example`
(עודכן ביום המיזוג וכולל: Supabase, Cardcom, R2, Meilisearch, Voucher QR,
WhatsApp, WP-import). כללי ברזל:

- שום secret לא מתחיל ב-`NEXT_PUBLIC_`.
- `SUPABASE_SERVICE_ROLE_KEY` (או `SUPABASE_SECRET_KEY`) חי רק ב-Vercel server env.
- `VOUCHER_QR_SECRET` הוא חובה למסלול הוואוצ'רים; אין לו default, חתימה בלעדיו
  נכשלת קשה. רוטציה דרך `VOUCHER_QR_SECRET_PREVIOUS` + `VOUCHER_QR_KEY_ID`.
- `CHECKOUT_ENABLED` הוא ה-kill switch; בפרודקשן הוא true רק כשכל ארבעת משתני
  Cardcom + secret ה-webhook קיימים.

## 3. Security headers (מיושמים ב-`next.config.ts`)

מקור האמת הוא הקוד; זה התיעוד שלו נכון ליום המיזוג:

| Header | ערך (תמצית) |
|---|---|
| Content-Security-Policy | `default-src 'self'`; תמונות: Supabase + Unsplash; ‏`connect-src`: Supabase; ‏`frame-src`/`form-action`: ‏`secure.cardcom.solutions`; ‏`frame-ancestors 'none'`; ‏`upgrade-insecure-requests` |
| Strict-Transport-Security | `max-age=63072000; includeSubDomains; preload` |
| X-Frame-Options | `DENY` |
| X-Content-Type-Options | `nosniff` |
| Referrer-Policy | `strict-origin-when-cross-origin` |
| Permissions-Policy | `camera=(), microphone=(), geolocation=(), payment=(self)` |

חוב ידוע: ‏script/style עדיין `unsafe-inline` עד שייכנס nonce פר-בקשה דרך
`src/proxy.ts` (מתועד בהערת הקוד וב-`INFRA-AUDIT.md` §2). כשה-R2 יופעל, יש
להוסיף את `R2_PUBLIC_BASE_URL` ל-`img-src`.

## 4. מסד נתונים: סדר החלה מחייב

רצף המיגרציות אוחד ביום המיזוג ל-001..065 ואומת ב-reset מלא מאפס על ה-stack
המקומי (65/65 עוברות, 211 policies, אפס טבלאות בלי RLS). שני שלבים:

1. **חלות עכשיו (עד 057):** ‏052 approval, ‏053 support role, ‏054 vouchers,
   ‏055 account wallet, ‏056 analytics v3, ‏057 wp_migration_log. החלה על
   הפרודקשן רק דרך סשן MCP מבוקר, אחת-אחת, עם SELECT אימות אחרי כל אחת.
2. **משפחת האגורות (058-065): לא להחיל** עד cutover קוד. ‏059 משנה שמות עמודות
   שהקוד הרץ קורא (`price_ils` ועוד). ההחלה שלה היא פרויקט נפרד: קוד קורא
   `*_agorot` -> מיזוג -> החלה -> ניקוי `*_legacy`.

אסור בשום שלב: ‏`supabase db push`, ‏`drizzle-kit push/migrate` מול DB אמיתי.
‏Drizzle נדחה בהחלטת הפורט; `drizzle.config.ts` נשאר בעץ רק כי מחיקתו היא
החלטת קוד (מועמד למחיקה בסבב הבא).

## 5. Cron ורקע

- `supabase/schedules/analytics_cron.sql`: תזמוני pg_cron לאגרגציות analytics;
  מוחל ידנית אחרי 056, לא חלק מרצף המיגרציות.
- `vercel.json` (אם קיים בפרויקט הפרוס): cron ל-checkout recovery. לאמת מול
  הקונפיג בפועל לפני go-live.

## 6. אימות פריסה

שערי חובה לפני כל פריסה, מקומית או CI:

```
pnpm type-check && pnpm vitest run && pnpm build
supabase db reset --local
```

‏E2E ‏(Playwright): ‏`pnpm test:e2e` מול ה-stack המקומי עם ה-seed האידמפוטנטי
(`scripts` של feat/testing-cicd). ה-CI (GitHub Actions) מריץ lint gate מבוסס
רגרסיה על ה-diff בלבד.

צ'קליסט הצעדים המלא של יום ההעלאה: ‏`GO-LIVE.md`.
