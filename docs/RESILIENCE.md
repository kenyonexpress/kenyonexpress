# עמידות: המפה (‏SECTIONS 83)

נמדד ‏22.09.2026. הסעיף ביקש עשרה דברים; שבעה היו קיימים ונמדדו, שניים נבנו
היום, ואחד ‏(‏R2) חסום על החשבון. הפירוט: ‏`ARCHITECTURE-FEATURE-FLAGS.md`
‏(החוזה), ‏`WEBHOOK-RELIABILITY` בסעיף ‏39 ‏(התור), ‏`RUNBOOK.md` ‏(החזרה לאחור).

## 1. הסעיף, שורה מול מה שיש

| מה הסעיף ביקש | מצב | הראיה |
| --- | --- | --- |
| ‏circuit breaker ל-Meilisearch | **יש** | ‏`lib/search/meili-breaker.ts`: ‏3 כשלים פותחים, ‏30 שניות צינון; ‏fallback ל-ILIKE ב-`search-server.ts` |
| ‏Redis ‏(Upstash) | **יש, נפילה ל-Postgres** | ‏`lib/rate-limit/limiter.ts` §`viaPostgres`; רושם ‏`upstash_failed` / ‏`open` |
| ‏R2 | **חסום על החשבון** | ‏R2 אינו מופעל; ‏`mirrorPdf` וגיבוי ‏R2 מדלגים ואומרים זאת ‏(‏`docs/DR.md`) |
| תשלומים ‏(Cardcom) | **יש** | ‏`lib/payments/cardcom.ts`: ‏timeout על כל קריאה, ניסיון חוזר **אחד** ורק לכשל תעבורה, **אף פעם לא** על חיוב או החזר; ‏`chaos.test.ts` |
| ניסיון חוזר עם ‏backoff | **יש** | חשבוניות ‏(‏5 ניסיונות), ‏DLQ של ‏webhooks ‏(‏5 עם המתנה מתרחבת), ‏outbox |
| ‏dead-letter ל-webhooks ולעבודות, עם ‏replay מהאדמין | **יש ל-webhooks** ‏(‏`/admin/queues`, ‏`webhook-dlq`); לעבודות: ‏`job_runs` ‏(‏228) רושם כשל, והריצה הבאה לפי הלוח היא ה-replay | סעיף ‏39, ‏55 |
| דגל מצב תחזוקה | **נבנה ‏22.09** | ‏`MAINTENANCE_MODE` ב-`src/proxy.ts`: ‏503 עם דף עברי ‏RTL ו-`Retry-After: 300`; אדמין, ‏`/api/cron`, ‏`/api/health`, ניטור ונכסים נשארים. ‏`lib/resilience/maintenance.ts` + טסטים |
| טבלת ‏feature_flags + ממשק אדמין | **נבנה ‏22.09** | ‏235, ‏`lib/resilience/feature-flags.ts` ‏(סדר עדיפות טהור), ‏`server/resilience/flags.ts` ‏(מטמון ‏30 שניות), ‏`/admin/feature-flags` עם הדלקה/כיבוי ו-audit |
| מתג הרג לקופה | **יש, ועכשיו גם מהטבלה** | ‏`CHECKOUT_ENABLED` בסביבה ‏(‏`payments/env.ts`) **וגם** הדגל ‏`CHECKOUT_ENABLED` בטבלה; הסביבה גוברת |
| ‏chaos tests | **יש** | ‏`lib/resilience/chaos.test.ts`: ‏Cardcom תוקע, מתג כבוי; ‏`maintenance.test.ts`, ‏`feature-flags.test.ts` |

## 2. שני סוגי מתגים, בכוונה

**מתגי הרג ומצב תחזוקה חיים בסביבה בלבד.** ‏`KILL_SWITCH_*` נקראים בזמן
הקריאה כדי שמופע חם לא ייתקע, ו-`MAINTENANCE_MODE` נקרא ב-proxy לפני שנוגעים
במסד. מתג שצריך לקרוא מהמסד כדי לומר "אל תקראו מהמסד" אינו מתג. הם מוצגים
באדמין לקריאה בלבד.

**דגלי מוצר חיים בטבלה, והסביבה גוברת.** ‏`resolveFlag`: סביבה, ואז טבלה,
ואז ברירת המחדל המתועדת. הסביבה גוברת כי זה מה שמפעיל מושיט אליו יד ב-03:00
מ-Vercel, ושורה שהייתה דורסת אותה בשקט היא מתג שעושה את ההפך ממה שהאחרון
שנגע בו חושב. הטבלה גוברת על ברירת המחדל כי זה מה שהאדמין עורך. שינוי חל
תוך ‏30 שניות על כל מופע, ו-`ESCROW_FLOW_ENABLED` אינו בטבלה: המסמך אומר
שאסור שיהיה ‏true, ושורה היא הזמנה.

## 3. מצב תחזוקה, מה בדיוק קורה

‏`MAINTENANCE_MODE=true` ‏(או ‏1/on/yes, ורק אלה) ב-Vercel → מהמופע הבא כל
בקשה לחנות, לחשבון, לפורטל הספק ול-API הציבורי מקבלת ‏503 עם דף אחד עצמאי:
בלי סקריפט, בלי נכסים חיצוניים, ‏`noindex`, ‏`Cache-Control: no-store`,
‏`Retry-After: 300`. פטורים: ‏`/admin`, ‏`/api/admin`, ‏`/api/cron`, ‏`/api/health`,
‏`/monitoring`, ‏`/_next/`, ‏favicon, ‏robots, ‏manifest. מתזמן שהיה רואה ‏503 היה
פותח תקריות על התחזוקה שהודיעו לו עליה; לכן הוא פטור.

## 4. לאמת מחדש

```
MAINTENANCE_MODE=true pnpm start   # ואז curl -i localhost:3000/ → 503, curl -i localhost:3000/api/health → 200
pnpm exec vitest run src/lib/resilience/
```
