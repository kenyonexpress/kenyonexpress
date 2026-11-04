# מה רק אופיר יכול לעשות

נמדד 05.11.2026 (S29). שורה אחת לפריט, לפי סדר עדיפות. כל השאר נעשה בקוד ואינו דורש אותך.
הפרויקט ב-Vercel שמגיש את `www.kenyonexpress.co.il` הוא `kenyonexpress` בלבד (`prj_v49dZbPUpk1UxyHbXTCiIJlQ7opP`). הראיות לכל שורה: `docs/LAUNCH-CHECKLIST.md`.

1. **קארדקום:** להזין ב-Vercel Production את `CARDCOM_TERMINAL_NUMBER`, ‏`CARDCOM_API_NAME`, ‏`CARDCOM_API_PASSWORD` האמיתיים מקארדקום ו-`CARDCOM_SANDBOX=false` (הערכים הקיימים נוצרו 04.10 בידי סוכן ואינם מאומתים).
2. **הזמנת ₪1 אמיתית וזיכוי שלה** בכרטיס שלך, אחרי שורה 1 ופריסה, כדי להוכיח סליקה וזיכוי מקצה לקצה.
3. **להחליט על העלייה לאוויר:** למחוק את `MAINTENANCE_MODE` מ-Vercel Production (מוגדר מ-25.10, כל דף ציבורי עונה 503) ולפרוס.
4. **Resend:** ליצור מפתח חדש ב-`resend.com/api-keys` ולשים אותו ב-`RESEND_API_KEY` ב-Production, או לאשר שהמפתח מ-06.10 שולח (הקודם החזיר 401, החדש לא נבדק מעולם).
5. **רוטציית הסודות שדלפו לריפו הציבורי** (S24): ‏`CRON_SECRET` ב-Vercel וב-vault של Supabase באותו צעד, ‏`VOUCHER_QR_SECRET` עם חלון של שני מפתחות, סיסמת ה-protection ו-`VERCEL_API_TOKEN` בחשבון Vercel שלך.
6. **רוטציית `SUPABASE_SECRET_KEY`** בדשבורד Supabase והחלפתו ב-Vercel Production (נוהל ב-`docs/RUNBOOK.md`).
7. **החלטות קטלוג:** לבחור את השורה האמיתית בכל כפילות ואת המחיר הנכון בכל מחיר שסותר את הטקסט שלו, לפי `supabase/catalogue-known-issues.json`.
8. **הזמנות הבדיקה ב-DB של פרודקשן:** לאשר או לדחות מחיקה של הזמנות E2E (777 ב-7 ימים), כי מחיקת DB היא שלך בלבד.
9. **Upstash:** לפתוח מסד Redis ולהזין `UPSTASH_REDIS_REST_URL` ו-`UPSTASH_REDIS_REST_TOKEN` ב-Production (היום ההגבלה רצה על Postgres, עובד ואיטי יותר).
10. **R2:** להפעיל ב-Cloudflare את ה-URL הציבורי `r2.dev` של הבאקט (או להעביר את `cdn.kenyonexpress.co.il` לאזור Cloudflare) ולוודא שזוג המפתחות מ-04.11 נכון (S04).
11. **WhatsApp:** לאמת את החשבון העסקי ב-`business.facebook.com`, אחרת ההודעות מחווטות ואינן נשלחות.
12. **Axiom:** לחבר drain או את האינטגרציה ב-Vercel לפרויקט `kenyonexpress` (S26, היום אין).
13. **MFA לחשבון האדמין של הבדיקות**, כדי שהחזר כספי מצד האדמין ייבדק ב-E2E (S27 לא הצליח להיכנס).
14. **פרויקט Supabase לפיתוח** עם `SEED_SUPABASE_URL` ו-`SEED_SUPABASE_SERVICE_KEY`, כדי שקטלוג הדמו ייזרע מחוץ לפרודקשן (חוסם 15 ב-STATE.md).

## מה לא ברשימה, ולמה

- **DNS:** ה-NS כבר `ns1/ns2.vercel-dns.com`, והדומיין מגיש אותנו. אין מה לעשות אצל הרשם.
- **פריסה:** כל push ל-`closeout/v1-final` הוא פריסת פרודקשן, והחיה היא HEAD (`65f6c5912`).
- **מיגרציות:** מוחלות אחת-אחת מתוך התור לפי `migrations/pending/APPLY-ORDER.md`, כולל התיקון ל-12 משימות ה-POST של 162 שעונות 405.
- **ח.פ 033798513** כבר בשורת המוכר, בתנאים וב-JSON-LD.
- **Sentry:** ‏`SENTRY_DSN` ו-`NEXT_PUBLIC_SENTRY_DSN` מוגדרים בפרודקשן, ואירוע נמסר (S26).
