# Backlog: manual items for Ofir

Created 2026-09-29 (M15-c51) as the single canonical list. Before this file
existed, `STATE.md` and `docs/LAUNCH-READINESS.md` each kept their own
"ידני לאופיר" list, and the two had drifted: different migration numbers,
two items present in one and missing from the other (the catalogue decision,
the `cron-jobs.json`/`main` mismatch), two more present in `STATE.md`'s
blockers but never carried into its own action list (`RESEND_API_KEY`, the
ח.פ line). This file merges both, in the order that a real customer would
hit them, deduplicated. `STATE.md` and `docs/LAUNCH-READINESS.md` now point
here instead of keeping their own copy — see each file's own evidence
sections (STATE.md "חוסמים פתוחים", LAUNCH-READINESS.md "Blocking line")
for the measurement behind each item; this file lists the action and its
source, not the evidence itself.

Nothing here is an action an agent may take alone (Vercel env, DNS, secret
rotation, a value only Ofir has, or a decision the ledger says is an
operator's, not the agent's — see `CLAUDE.md`'s stop conditions).

## ידני לאופיר, לפי סדר קריטיות

1. **DNS ברשם — RESOLVED (נמדד 29.09, M01-c52).** ה-NS כבר
   `ns1.vercel-dns.com` / `ns2.vercel-dns.com`, הדומיין עונה 200 עם התוכן
   האמיתי. שום פעולה נוספת נדרשת מאופיר על הסעיף הזה. מקור: STATE.md
   חוסם 1 (עודכן), LAUNCH-READINESS.md שורה חוסמת 1 (טרם עודכן שם).
2. **`CRON_SECRET` זהה ב-GitHub וב-Vercel.** כרגע 40/40 הרצות מתוזמנות
   נכשלות ב-401 (סוד שונה בכל צד), ו-`notification_outbox` מחזיקה הודעות
   ממתינות מ-10.09. לקרוא את הערך ב-Vercel (פרויקט `kenyonexpress`,
   Production) ולהדביק אותו ב-GitHub Settings > Secrets > Actions >
   `CRON_SECRET`. הריצה הבאה צריכה להראות `notifications -> 200`.
   מקור: STATE.md חוסם 10, LAUNCH-READINESS.md שורה חוסמת 3.
3. **סביבת Production ב-Vercel לפני כל פריסה.** להוסיף
   `CARDCOM_TERMINAL_NUMBER`, `CARDCOM_API_NAME`, `CARDCOM_API_PASSWORD`
   (השמות שהקוד קורא בפועל; `CARDCOM_API_KEY`/`CLIENT_ID`/`MERCHANT_ID`
   הקיימים שם אינם נקראים) ולהסיר `ALLOW_INCOMPLETE_ENV`. בלעדיה
   `deploy-preflight` מסרב לכל build. מקור: STATE.md חוסם 2,
   LAUNCH-READINESS.md שורה חוסמת 4.
4. **אישור פריסת HEAD לפרודקשן**, אחרי סעיף 3. פרודקשן עדיין מגיש
   `a388118f1`, שהיה 22 קומיטים מאחורי ב-25.09 וכעת (29.09, מדידה מקומית
   בלבד — לא נבדק מול הפריסה החיה בפריט הזה) 47 קומיטים מאחורי HEAD.
   `POST /v13/deployments` עם `gitSource.sha`, `target=production`, לפי
   `docs/RUNBOOK.md`. מקור: STATE.md חוסם 2, LAUNCH-READINESS.md שורה
   חוסמת 4.
5. **החלת המיגרציות הממתינות**, לפי הסדר והתנאים המוקדמים ב-
   `migrations/pending/APPLY-ORDER.md` ו-`docs/RUNBOOK.md` — **לא** לפי
   סדר מספרי גרידא (218 חייב לקדום ל-217, למשל). האיחוד של שתי הרשימות
   שהיו כתובות בנפרד (STATE.md חוסם 3: 218, 245, 246, 204, 240-244;
   LAUNCH-READINESS.md שורה 5: 204, 223, 224, 234-236, 239-244), פלוס 209
   ו-220 שנזכרים כתלות של 245/246 באותה רשומה: **204, 209, 218, 220, 223,
   224, 234, 235, 236, 239, 240, 241, 242, 243, 244, 245, 246** (17
   קבצים). אחרי ההחלה: `pnpm db:types` ו-commit.
6. **Cardcom אמיתי.** לבדוק את הערכים של `CARDCOM_API_KEY`/`CLIENT_ID`/
   `MERCHANT_ID` הקיימים בשם ב-Vercel, לקבוע `CARDCOM_USE_MOCK=false` ו-
   `CHECKOUT_ENABLED=true`, לפרוס מחדש (ה-CSP נאפה בזמן build, לא בזמן
   ריצה), ולבצע חיוב אמיתי אחד קטן וזיכוי דרכו. מקור: STATE.md חוסם 8,
   LAUNCH-READINESS.md שורה חוסמת 2.
7. **הכרעה על 25 שורות הקטלוג** ב-`supabase/catalogue-known-issues.json`:
   אילו משתי ה-`עיסוי מאסטר` הכפולות היא האמיתית, מה המחיר שלה (₪9 או
   ₪108, לפי מה שה-slug של ארבע שורות טוען), ומחיקת חמש שורות ה-`-copy`/
   `-העתק`/`-לדוגמא`. שום דבר כאן אינו לתיקון אוטומטי — ראו `CLAUDE.md`
   §"מצב נוכחי" סעיף 1. **לא היה ברשימת STATE.md;** מקור:
   LAUNCH-READINESS.md שורה חוסמת 6, `CLAUDE.md`.
8. **רוטציית `SUPABASE_SECRET_KEY`.** המפתח בשימוש נחשף בהתקנה; מסומן
   ב-`scripts/compromised-keys.mjs`, ו-`deploy-preflight` מסרב לבנות
   איתו. נוהל ב-`docs/RUNBOOK.md`. מקור: STATE.md חוסם 7,
   LAUNCH-READINESS.md שורה חוסמת 7.
9. **`RESEND_API_KEY` בפרודקשן.** השם קיים ב-target Production אך הערך לא
   נקרא; בלעדיו כל חמשת סוגי המייל נופלים בשקט ל-`skipped` ואיפוס סיסמה
   חוזר ל-SMTP של Supabase. **לא היה ברשימת הפעולות של STATE.md** (רק
   ברשימת החוסמים שלו); מקור: STATE.md חוסם 6.
10. **הפעלת R2 בדשבורד Cloudflare.** בלעדיה תמונות המוצר נופלות ל-Supabase
    Storage וגיבויי ה-DB החיצוניים לא נכתבים. מקור: STATE.md חוסם 4,
    LAUNCH-READINESS.md שורה חוסמת 8.
11. **`scripts/cron-jobs.json` ב-`main`** מכיל שבעה נתיבים שאינם קיימים
    ב-HEAD (`search-reindex`, `job-dlq`, `search-outbox`,
    `cashback-settlement`, `email-retry`, `expire-cashback`,
    `expire-coupons`); כל אחד עונה 404 גם אחרי שסעיף 2 נסגר. נפתר מעצמו
    כשהענף הזה יתמזג ל-`main` (PR, ארבע בדיקות). **לא היה ברשימת
    STATE.md;** מקור: LAUNCH-READINESS.md ידני 9.
12. **`scripts/dns-watch.sh` (pid 957 בזמן המדידה)** עדיין רץ תחת
    `caffeinate` ומשגר סשן פריסה כשיופיעו NS של Cloudflare; המעבר
    ל-vercel-dns (סעיף 1) לא אמור להפעיל אותו, אבל לבדוק לפני שמפעילים
    משהו אחר. מקור: STATE.md ידני 8, LAUNCH-READINESS.md ידני 10.
13. **מספר עוסק/ח.פ לשורת המוכר** באישור הרכישה: עריכה אחת ב-
    `messages/he.json`, `purchaseConfirmation.sellerName`, ברגע שהערך
    מגיע מאופיר — הסוכן אינו מחזיק אותו. מקור: STATE.md חוסם 9,
    LAUNCH-READINESS.md ידני 11.
14. **כניסה בטלפון (Q17).** ספק SMS בהגדרות ה-auth של Supabase, ואז
    `PHONE_AUTH_ENABLED=true` ב-Vercel. בלעדיהם הכפתור מוסתר והשאר עובד.
    מקור: STATE.md ידני 10, LAUNCH-READINESS.md ידני 12.
15. **עשרה stash-ים לא נמחקו** (רשימה בארכיון תחת Q01). כלל הפרויקט אוסר
    מחיקת נתונים בלי אישור מפורש, כך שההכרעה עצמה היא של אופיר, לא רק
    הביצוע. מקור: STATE.md ידני 9, LAUNCH-READINESS.md ידני 13.

## מה לא ברשימה, ולמה

`docs/MIGRATION-BACKLOG.md` ו-`docs/POST-LAUNCH-BACKLOG.md` הם קבצים
נפרדים, לא תורים פעילים (הראשון ריק לפי הבאנר שלו, השני "כל מה שנדחה
במכוון") — נבדק ונרשם ב-B02..M08-c1, בארכיון. הפריט הזה (M15-c51) אינו
נוגע בהם.
