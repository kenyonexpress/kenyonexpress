# ‏Runbook: המתזמן (‏cron מ-GitHub Actions)

| שדה | ערך |
| --- | --- |
| רכיב | ‏30 מסלולי ‏`/api/cron/*`, מופעלים מ-`.github/workflows/cron.yml` עם ‏bearer ‏`CRON_SECRET` |
| ספק | ‏GitHub Actions (best effort), והצהרת ‏`crons` ב-`vercel.json` כעותק זהה |
| כרטיס ב-/admin/health | `scheduler` (‏`CRON_SECRET` מוגדר), וכל ‏run ב-`gh run list --workflow=cron.yml` |
| כונן | אופיר |
| חומרה ברירת מחדל | ‏SEV2. ‏SEV1 כש-`stranded-payments` ו-`reconcile` לא רצים ויש תשלומים אמיתיים |
| סולם הסלמה | ‏`README.md` §סולם ההסלמה |

**שני דברים שחייבים להיות נכונים ואי אפשר לראות מהקוד:** המשתנה
‏`CRON_SCHEDULER_ENABLED=true` ב-GitHub (מתג ראשי, נבדק לפני שה-runner עולה),
וה-secret ‏`CRON_SECRET` ב-GitHub **זהה** לערך ב-Vercel. ב-25.09 נמדד: המתג
דלוק, הסוד שונה, ‏40 מתוך ‏40 ריצות נכשלו ב-401, ו-72 הודעות המתינו מ-10.09.

## 1. רדיוס פגיעה

כל מה ש"אמור לקרות לבד": שליחת מייל השובר, תפוגת שוברים וקופונים, השלמת
תשלומים תקועים, התאמה מול ‏Cardcom, חשבוניות, ‏DLQ של ‏webhooks, ניקוז
אינדקס החיפוש, גיבוי, ‏digest. שום בקשת לקוח לא נחסמת; הכול מתעכב.

| עבודה | תזמון | מסלול |
| --- | --- | --- |
| `notifications` | `*/5 * * * *` | `/api/cron/notifications` |
| `health` | `*/5 * * * *` | `/api/cron/health` |
| `invoices` | `*/10 * * * *` | `/api/cron/invoices` |
| `stock` | `*/10 * * * *` | `/api/cron/stock` |
| `stranded-payments` | `*/10 * * * *` | `/api/cron/stranded-payments` |
| `webhook-dlq` | `*/10 * * * *` | `/api/cron/webhook-dlq` |
| `job-dlq` | `*/10 * * * *` | `/api/cron/job-dlq` |
| `abandoned-cart` | `0 * * * *` | `/api/cron/abandoned-cart` |
| `subscriptions` | `30 2 * * *` | `/api/cron/subscriptions` |
| `reap-carts` | `40 3 * * *` | `/api/cron/reap-carts` |
| `reconcile` | `0 4 * * *` | `/api/cron/reconcile` |
| `expire-vouchers` | `15 23 * * *` | `/api/cron/expire-vouchers` |
| `expire-cashback` | `15 23 * * *` | `/api/cron/expire-cashback` |
| `whatsapp` | `*/5 * * * *` | `/api/cron/whatsapp` |
| `search-outbox` | `*/10 * * * *` | `/api/cron/search-outbox` |
| `search-reindex` | `0 * * * *` | `/api/cron/search-reindex` |
| `retention` | `0 5 1 * *` | `/api/cron/retention` |
| `weekly-digest` | `0 4 * * 5` | `/api/cron/weekly-digest` |
| `expire-coupons` | `15 23 * * *` | `/api/cron/expire-coupons` |
| `backup` | `20 2 * * *` | `/api/cron/backup` |
| `wishlist-alerts` | `45 4 * * *` | `/api/cron/wishlist-alerts` |
| `wishlist-digest` | `0 5 * * 5` | `/api/cron/wishlist-digest` |
| `daily-deals` | `0 3 * * *` | `/api/cron/daily-deals` |
| `email-retry` | `30 */6 * * *` | `/api/cron/email-retry` |
| `cashback-settlement` | `45 23 * * *` | `/api/cron/cashback-settlement` |
| `slow-statements` | `30 2 * * *` | `/api/cron/slow-statements` |
| `sitemap-regen` | `0 3 * * *` | `/api/cron/sitemap-regen` |
| `analytics-rollup` | `30 2 * * *` | `/api/cron/analytics-rollup` |
| `log-cleanup` | `30 */6 * * *` | `/api/cron/log-cleanup` |
| `shipments-track` | `0 * * * *` | `/api/cron/shipments-track` |

## 2. זיהוי

- ‏`gh run list --workflow=cron.yml --limit 20`: רצף אדום.
- בלוג של ריצה, שורות ‏`-> NNN`: ‏**401** סוד לא תואם; ‏**404** ‏`main` מצהיר
  מסלול שה-deploy החי לא מכיל (המתזמן רץ רק מ-`main`, הקוד מוגש מענף אחר);
  ‏**5xx** המסלול עצמו נופל.
- ‏`/admin/health` ‏`scheduler` ‏`not_configured`: ‏`CRON_SECRET` חסר ב-Vercel.
- סימפטומים עקיפים: ‏`notification_outbox` ‏pending מצטבר (‏`email-resend.md`),
  שוברים שפג תוקפם עדיין ‏`active`, ‏`search_outbox` גדל.
- ‏GitHub משבית ‏cron אחרי ‏60 יום בלי ‏commit, במייל בלבד.

## 3. טריאז'

1. **כל הריצות ‏401?** סוד לא תואם. אין מה לתקן בקוד; ‏§6.
2. **‏404 על חלק?** ‏`scripts/cron-jobs.json` ב-`main` לפני ה-deploy החי.
   לא תקרית של המתזמן; זה ‏`web-vercel.md` (ענף הפרודקשן).
3. **ריצה בודדת אדומה?** המסלול עצמו: ‏Sentry לפי ‏`route`. כל המסלולים
   אידמפוטנטיים, ריצה חוזרת ידנית בטוחה.
4. **אין ריצות בכלל?** המתג כבוי, או ‏GitHub השבית (‏Actions > Scheduled jobs >
   Enable workflow).
5. **עבודה רצה פעמיים?** שני מתזמנים (‏Vercel crons על תוכנית שמכבדת אותם
   ‏+ ‏Actions). לכבות אחד; ‏`notifications` פעמיים הוא גלוי ללקוח אם
   ה-dedupe של ה-outbox נסוג.

## 4. צעדי Rollback

1. **לעצור את כל המתזמן**: ‏GitHub > Settings > Secrets and variables >
   Actions > Variables, ‏`CRON_SCHEDULER_ENABLED` לכל ערך שאינו ‏`true`. אפס
   עלות, אפס קריאות, הפיך ברגע.
2. **לעצור עבודה אחת**: אין מתג פר עבודה. ‏Rollback של הקוד שלה
   (‏`web-vercel.md` §4) או, אם היא שולחת, ‏`KILL_SWITCH_NOTIFICATIONS`.
3. **להריץ עבודה אחת ידנית** (אחרי תיקון, או כגשר):

```bash
curl -sS -H "Authorization: Bearer $CRON_SECRET" https://kenyonexpress.co.il/api/cron/<name>
```

   לעולם לא להדפיס את הסוד ללוג.
4. **סוד לא תואם**: ערך אחד חדש, לשני המקומות, באותו רגע: ‏Vercel Production
   ‏+ ‏redeploy, ואז ‏GitHub secret. ‏`SECRETS-ROTATION.md` §`CRON_SECRET`.
5. **‏60 יום בלי ‏commit**: ‏commit ריק לענף ‏`main` דרך ‏PR (מוגן), או
   ‏Enable workflow ב-UI.

## 5. מה לא ניתן להחזיר

- עבודה שרצה: ‏`expire-vouchers` שסימן שוברים ‏`expired` לא "מתבטל"; זו תנועת
  מצב קדימה עם טריגר שמונע חזרה.
- חלון שפוספס: ‏`reconcile` של ‏04:00 שלא רץ מושלם בריצה הבאה; מייל של
  ‏`weekly-digest` שפוספס פשוט לא יוצא.

## 6. מתי להסלים

- כל שינוי ב-`CRON_SECRET` או ב-`CRON_SCHEDULER_ENABLED`: חשבון של אופיר, ב-GitHub
  וב-Vercel יחד.
- ‏`stranded-payments` או ‏`reconcile` לא רצים ‏24 שעות כשיש מכירות: ‏SEV1.
- עבודה שרצה פעמיים ושלחה פעמיים: ‏SEV2 ואופיר מודע.

## 7. אימות אחרי

```bash
gh run list --workflow=cron.yml --limit 5     # ירוק
curl -sS -o /dev/null -w '%{http_code}\n' https://kenyonexpress.co.il/api/cron/health   # 401 בלי bearer = נכון
```

‏`/admin/health` ‏`scheduler` ‏`ok`, ו-`notification_outbox` ‏pending יורד
בין שתי ריצות.

## 8. מסמכים קשורים

‏`../CRON-EXTERNAL.md`, ‏`../OPERATIONS-CALENDAR.md`, ‏`../RUNBOOK.md` §2,
‏`scripts/cron-jobs.json`, ‏`src/__tests__/cron-schedule-inventory.test.ts`
(ארבעת התיאורים חייבים להסכים; הטבלה כאן נבדקת מולם גם היא).
