# מה רק אופיר יכול לעשות

עודכן: 2026-10-25 (C15). רק פעולות שדורשות חשבון, טלפון או סיסמה שלך. כל השאר מבוצע אוטומטית.
המיון ל-HOLD ב-`docs/LAUNCH-CHECKLIST.md`. **אין כאן ערכי סודות; הם לא נכתבים בשום מסמך.**

סדר מומלץ: 4, 1, 3, 5, 2, 6, 7.

## 1. Cardcom: מסוף ייצור (שיחת טלפון + 10 דקות)
1. לבקש מ-Cardcom פרטי מסוף ייצור: מספר מסוף, שם API, סיסמת API, סוד webhook.
2. ב-Vercel > הפרויקט > Settings > Environment Variables (Production), להגדיר:
   `CARDCOM_TERMINAL_NUMBER`, `CARDCOM_API_NAME`, `CARDCOM_API_PASSWORD`, `CARDCOM_WEBHOOK_SECRET`.
3. לשנות `CARDCOM_USE_MOCK` ל-`false`, ולשנות `CHECKOUT_ENABLED` ל-`true` רק אחרי שלב 4.
4. ב-Cardcom להגדיר את כתובת ה-webhook של האתר (הנתיב ב-`docs/ARCHITECTURE-CHECKOUT-CARDCOM-E2E.md`).
5. Redeploy.

## 2. DNS אצל הרשם (30 דקות + המתנה)
**רק אחרי שחיוב אמיתי אחד הצליח על כתובת `vercel.app`.**
להפנות את `kenyonexpress.co.il` ו-`www` ל-Vercel לפי `docs/DNS-CUTOVER-PLAN.md`. קודם להוריד TTL. הדומיין הקנוני בקוד הוא ה-apex; ודא ש-`www` מפנה אליו (או להפך, ואז יתוקן הקוד, ראה M15 ב-STATE).

## 3. Resend (5 דקות)
ליצור API key חדש ב-Resend, לוודא שהדומיין השולח מאומת (SPF, DKIM, DMARC), ולהגדיר `RESEND_API_KEY` ב-Vercel. המפתח הנוכחי מחזיר 400.

## 4. Supabase: גישה והחלת מיגרציות
1. להתחבר ל-Supabase MCP (OAuth, כולל 2FA) או לעדכן `SUPABASE_SERVICE_ROLE_KEY` ב-`.env.local` במקום הערך הנוכחי.
2. אחרי החיבור הלולאה מחילה את המיגרציות בעצמה, אחת בכל פעם, לפי `migrations/pending/APPLY-ORDER.md`. **297 לפני כל השאר** (בלעדיה פרטי הזמנות חשופים לאנונימי). לא נדרשת פעולה נוספת ממך.
3. לשקול רוטציה של המפתח הסודי (נחשף בעבר, ראה `docs/OFIR-MUST-FILL.md`).

## 5. Cloudflare Turnstile (10 דקות)
בדשבורד Cloudflare ליצור site (Managed), ולהגדיר ב-Vercel: `NEXT_PUBLIC_TURNSTILE_SITE_KEY` ו-`TURNSTILE_SECRET_KEY`. הוראות מלאות: `docs/C56-TURNSTILE-SETUP.md`.

## 6. פרטי עסק (15 דקות)
למלא את מה שחסר ב-`docs/OFIR-MUST-FILL.md`: כתובת רשומה, טלפון שירות, מייל פרטיות, מייל נגישות (חובה בתקנות), שעות פעילות. עבור ספקים: תקופת התחשבנות, סף תשלום מינימלי, חלון מחלוקת, סף תלונות להשעיה, והאם סעיף אי-התחרות נשאר.
שם משפטי (קניון אקספרס) וח.פ 033798513 כבר באתר.

## 7. אופציונלי, לא חוסם השקה
- `SENTRY_AUTH_TOKEN` אמיתי (מחליף placeholder) להעלאת source maps.
- סודות R2: `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` ב-GitHub Actions, להעלאת 375 הנכסים.
- הידוק DMARC מ-`p=none` ל-`quarantine` אחרי שבוע ניטור.
- `E2E_ADMIN_PASSWORD` ב-`.env.local` להרצות E2E של אדמין.

## אחרי שסיימת
לאמת: `/api/health` מחזיר `ok`, חיוב ניסיון אחד והחזר מלא עוברים, שובר ומייל מגיעים. לולאה תשלח `hey LAUNCH` כשהכול ירוק.
