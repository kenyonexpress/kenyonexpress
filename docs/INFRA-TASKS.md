# INFRA-TASKS: משימות תשתית backend

רשימת משימות תשתית ממוספרות ל-backend של KenyonExpress.
מבוצעות לפי הסדר, אחת בכל פעם, לפי חוקי CLAUDE.md.
מקור הממצאים: INFRA-AUDIT.md (טבלת הממצאים + פרק 1).

## משימה 1: endpoint לרענון ISR לפי דרישה (on-demand revalidation)

**סטטוס:** פתוח.

**הבעיה:** אין
`src/app/api/revalidate/route.ts`
(נמדד 03.09: הקובץ לא קיים). דפי ISR מתעדכנים רק לפי טיימר, ועריכת תוכן
ב-Supabase לא משתקפת באתר עד פקיעת ה-revalidate.

**הפתרון (לפי הספק שכבר כתוב ב-INFRA-AUDIT.md, פרק "Revalidate endpoint"):**

1. יצירת
   `src/app/api/revalidate/route.ts`
   עם: POST בלבד, `runtime = 'nodejs'`, השוואה בזמן קבוע של הכותרת
   `x-revalidate-secret`
   מול
   `REVALIDATE_SECRET`
   באמצעות
   `crypto.timingSafeEqual`,
   ואז `revalidateTag` לפי ה-`table` שב-payload.
2. מפת תגיות: `products` ו-`product_variants` אל התג `products`,
   `categories` אל `categories`,
   `coupon_deals` / `coupons` / `coupon_codes` אל `coupons`.
3. תיעוד `REVALIDATE_SECRET` ב-`.env.example`.
4. הגדרת Database Webhooks ב-Supabase (אחד לכל טבלה) לפי הבלוק המוכן
   ב-INFRA-AUDIT.md. שלב זה תלוי בפרודקשן חי, ולכן מתועד ולא מורץ.

**הגדרת סיום:** הקובץ קיים, בקשת POST עם secret שגוי מחזירה 401,
עם secret נכון מחזירה 200 ומריצה `revalidateTag`, טסטים ירוקים
(`pnpm test`, `pnpm type-check`, `pnpm lint`).
