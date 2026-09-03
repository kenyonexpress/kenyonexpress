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

## משימה 2: מיגרציית אימות לכיסוי RLS (assertion migration)

**סטטוס:** פתוח.

**הבעיה:** אין מיגרציה שנועלת את כיסוי ה-RLS כקוד
(נמדד 03.09: אין קובץ `rls_coverage` תחת
`supabase/migrations/`
או
`migrations/`,
והמספר 032 שהוצע ב-INFRA-AUDIT.md כבר תפוס על ידי
`032_wp_import_staging.sql`).
ה-RLS עצמו נכון (נבדק ב-audit ומחוזק במיגרציות 111 ו-122), אבל שום דבר
לא אוכף את זה קדימה: טבלה חדשה שתיווצר בלי RLS תעבור בשקט.

**הפתרון (לפי שורת הממצא P2 בטבלת INFRA-AUDIT.md):**

1. כתיבת מיגרציית אימות אידמפוטנטית, בלי שום שינוי סכימה, תחת
   `migrations/pending/`
   עם המספר הפנוי הבא אחרי האחרון ב-`migrations/applied/` (לא 032):
   בלוק `DO $$` שסורק את `pg_catalog.pg_tables` בסכימת `public` ומרים
   `EXCEPTION` עם רשימת הטבלאות אם קיימת טבלה עם `rowsecurity = false`.
2. בלי לקבע את מספר הטבלאות בקוד. הסכימה בפרודקשן היא lineage שונה
   מקבצי `supabase/migrations/` (ראה DB-DRIFT-AUDIT.md), ולכן האימות
   חייב להיות דינמי על כל הטבלאות שקיימות בפועל.
3. הקובץ ממתין לאישור לפי חוקי CLAUDE.md: אין `db push` ואין הרצת
   migration על פרודקשן בלי אישור.

**הגדרת סיום:** קובץ המיגרציה קיים ב-`migrations/pending/`, עומד בחוקי
האידמפוטנטיות של supabase-migrations, טסטים ירוקים
(`pnpm test`, `pnpm type-check`, `pnpm lint`).
