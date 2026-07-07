# KenyonExpress State

## Current Phase
**Phase 5 — Homepage 1:1 (סגור)**. branch `phase5/homepage`. מקור יחיד: `refs/ke_live_singlefile.html`.

## Last Completed
Session 2026-07-08 - מיגרציה 025 קונסולידציה הוחלה על המרוחק (Phase 3 סגור):
- **`025_consolidation.sql` הוחל** דרך Supabase MCP `apply_migration` על `ixvwfbuvfxxsjiywhbbb` (ACTIVE_HEALTHY). idempotent, מקור אמת ל-RLS: `003_rbac.sql`.
- **created_by** מאומת קיים על `products`, `categories`, `coupons`, `coupon_deals` (products/categories כבר היו איתו מ-005; ל-coupons ה-ALTER היה no-op כי כבר קיים).
- **content_uploader RLS**: `products` עם SELECT/INSERT/UPDATE own (בלי DELETE, מחיקה admin-only דרך 014); `categories` עם SELECT own בלבד (INSERT/UPDATE/DELETE נשארים admin-only לפי 012). 4 policies מאומתות ב-`pg_policies`.
- **איחוד audit**: 58 שורות (51 INSERT + 7 UPDATE) הוגרו מ-`admin_audit_log` ל-`audit_log` עם מיפוי enum (INSERT->created, UPDATE->updated); `admin_audit_log` נמחקה (DROP CASCADE); `audit_log_trigger_fn()` שוכתבה לכתוב ל-`audit_log` **לפני** ה-DROP כדי לא לשבור כתיבות עתידיות. אפס איבוד שורות.
- **12 storage policies** מאומתות קיימות (product-images / vendor-logos / category-icons x4), כולל תוספת האדמין מ-020 על product-images.
- **DRIFT שהתגלה**: בניגוד לקבצי המיגרציה (008 מוחקת `coupons`), ב-DB החי הטבלה `coupons` **קיימת** ועם `created_by`. יש פער בין קבצי המיגרציה למצב הפרודקשן. שווה בדיקה נפרדת.

Session 2026-06-26 — Phase 3 (Admin Panel) הושלם + מבנה דף מוצר סופי הוחלט:
- **Phase 3 (Admin Panel) הושלם** — כל דפי הניהול מחווטים ועובדים.
- **מבנה דף המוצר הסופי הוחלט:** מבוסס Groupon (AMC) + Electro. מקורות ייחוס שמורים ב-`refs/groupon_amc_deal.mhtml` + `refs/electro_product_page.mhtml` (gitignored, מקומיים בלבד — לא בריפו).
- **הבהרה:** קבצי ה-refs הם ייחוס **עיצובי בלבד** — אין לייבא מהם דאטה. טבלת `products` נשארת כמות שהיא (31 מוצרים). בונים את דף המוצר לפי המבנה, לא מייבאים את AMC/Electro.
- **קובץ אב למילוי:** `docs/product-page/KenyonExpress_קובץ_אב_דף_מוצר.docx` (tracked בריפו). Ofir ממלא אותו ואז commit מחדש עם הגרסה המלאה.
- **Next:** Ofir ממלא את קובץ האב → בונים `/products/[slug]` לפי המבנה שיתקבל.
- **שדות חדשים שיידרשו בטבלת `products`** (טרם קיימים — ראו סכמה חיה בת 26 עמודות): `city`, `business_whatsapp`, `promo_code`, `options[]`, `sold_count`, `redemption_steps`, `business_hours`, `waze_coords`, + supplier fields.

Session 2026-06-26 — Phase 3 admin dashboard wired:
- פאנל הניהול מחווט ועובד ב-`/admin/dashboard` (קובץ `src/app/(admin)/admin/dashboard/page.tsx`; `(admin)` הוא route group ולכן לא ב-URL).
- StatsCards מציגים נתונים אמיתיים מ-DB (8 קופונים, 31 מוצרים).
- RBAC guard פעיל: `(admin)/layout.tsx` עבר מ-`requireStaffSession` ל-`requireAdminSession` (admin/super_admin בלבד). אומת: `GET /admin/dashboard` → 307 → `/login?next=%2Fadmin%2Fdashboard`. commit `b4539d8`, pushed.

Session 2026-06-26 — פתרון 401 (מפתחות Supabase):
- ב-`.env.local` היה `NEXT_PUBLIC_SUPABASE_ANON_KEY` חתוך ומשובש (32 תווים, בלי נקודות, header פגום) → גרם ל-401.
- אחרי `Claude Code /login`: הוחלף ה-anon במפתח JWT מלא ותקין (role=anon, ref `ixvwfbuvfxxsjiywhbbb`, exp 2036), ונוסף `SUPABASE_SERVICE_ROLE_KEY` מלא (role=service_role) — **בלי** קידומת `NEXT_PUBLIC_` (סוד server-side בלבד).
- אומת: `git check-ignore .env.local` → מוגנן ב-gitignore (לא נכנס ל-git).
- אומת נקי: `pnpm dev` → `✓ Ready` על `localhost:3000`, `GET /` → 200, probe ישיר ל-Supabase REST עם ה-anon → 200. אין 401.

Session 2026-06-23 — שחזור פרויקט + שיטוח מבנה:
- הקוד שוחזר מ-`origin/phase5/homepage` (commit `92b858a`) אחרי איבוד מקומי. עץ העבודה היה מקונן (`kenyonexpress/kenyonexpress/`) — **שוטח**: כל הקבצים הועברו לשורש `/Users/ofir/kenyonexpress-web/kenyonexpress`, ה-scaffold הישן (13 tsx, eslint) הוסר. כעת מבנה יחיד ושטוח.
- `.env.local` שוחזר מגיבוי (פרויקט Supabase `ixvwfbuvfxxsjiywhbbb`) → השורש; מוגנן ב-gitignore.
- **אישור pnpm builds:** `pnpm-workspace.yaml` תוקן ל-`allowBuilds: {biome,parcel/watcher,swc/core,esbuild,sharp: true}` (pnpm 11.1.2 משתמש ב-`allowBuilds`, לא `onlyBuiltDependencies`). אזהרת `ERR_PNPM_IGNORED_BUILDS` נעלמה; `pnpm dev` עובד ישירות.
- אומת: `pnpm dev` → `localhost:3000` HTTP 200, כותרת "קניון EXPRESS", `.env.local` נטען.
- **חוקי פרויקט קבועים נוספו ל-CLAUDE.md** (נתיב יחיד, אין עותקים כפולים, pwd לפני כל פעולה, push מיידי אחרי commit).

Session 2026-06-22 — Admin dashboard shell:
- `(admin)/layout.tsx`: RBAC `requireStaffSession` (admin/super_admin/content_uploader) → `/login`, sidebar, RTL, Heebo via `font-sans`, צבע `#fed700`
- `(admin)/dashboard/page.tsx`: StatsCard עם ספירה חיה מ-`products`, `orders`, `coupon_deals`
- `requireStaffSession` + `isStaffRole` ב-`lib/admin/rbac.ts`; `/admin` מפנה ל-`/dashboard`
- AdminSidebar + StatsCard עודכנו ל-`#fed700`

Session 2026-06-22 — החלת 019/020/021 על המרוחק דרך Supabase MCP:
- הפרויקט `ixvwfbuvfxxsjiywhbbb` כבר ACTIVE_HEALTHY (לא INACTIVE כפי שתועד). יש דאטה: 12 קטגוריות, 31 מוצרים.
- `019` הוחל: טבלת `public.user_rate_limits` + `check_user_rate_limit` + `cleanup_user_rate_limits` (verified `to_regclass` not null).
- `020` הוחל: policies אדמין ל-bucket `product-images` (idempotent).
- `021` הוחל: buckets `products` + `coupons` נוצרו (buckets עכשיו: category-icons, coupon-images, coupons, product-images, products, vendor-logos) + policies.
- הוחל דרך `apply_migration` ולא `db push`: היסטוריית המיגרציות במרוחק מכילה רק 2 רשומות (auth_rate_limits, storage_buckets) בעוד שהסכמה כבר קיימת — `db push` היה נכשל על "already exists".
- git: עץ העבודה נקי, אין commits לא-דחופים. 021 כבר committed (בניגוד לתיעוד הקודם).

Session 2026-06-20 — מיגרציות rate-limit + storage:
- `019_user_rate_limits.sql` (commit `77cf701`, pushed): טבלת `public.user_rate_limits` + `check_user_rate_limit(user_id, action, limit, window)` SECURITY DEFINER, RLS ללא policies; helper `checkUserRateLimit()` ב-rate-limit.ts + טיפוס ב-database.ts. additive ל-002 (IP-keyed).
- `020_storage_product_images_admin.sql` (commit `a1aa413`, pushed): הוספת `public.is_admin()` ל-policies של bucket `product-images` (admin ProductForm). במקום עריכת 004 שכבר רץ.
- `021_products_coupons_buckets.sql` (לא committed עדיין): buckets חדשים `products` + `coupons`, public read, גישה `has_role('content_uploader') OR is_admin()`. נכתב כתחליף נכון לניסיונות לשכתב את 004 (באג `auth.role()='content_uploader'` = deny-all).
- כל ניסיונות `migration up`/`db push` נכשלו: אין DB נגיש (Docker down מקומית; remote unlinked + paused). 002/003/004 לא שונו (שכתובים שבורים נדחו).

Session 2026-06-20 — דף קטגוריה (commit `b5139e8`):
- `(store)/category/[slug]/page.tsx`: resolve לפי slug, breadcrumb עם הורה, צ'יפים לתת-קטגוריות, גריד מוצרים
- מיון `?sort=` (newest/price_asc/price_desc/name) דרך `components/category/CategorySort.tsx` (client)
- pagination `?page=` עם `count: 'exact'` ו-`components/category/Pagination.tsx` (חלון עמודים קומפקטי)
- empty state + `notFound()` לקטגוריה חסרה/לא פעילה
- `type-check` + `biome` נקיים. בדיקה חיה חסומה: פרויקט Supabase במצב INACTIVE (queries עושים timeout → 404)

Session 2026-06-20 — Admin refactor (commit `6f96164`):
- `DataTable` גנרי (מיון/חיפוש) + `CategoriesTable`/`CouponsTable`/`ProductsTable`/`UsersTable`/`CouponForm`
- shell עבר מ-`(admin)/admin/layout.tsx` ל-`(admin)/layout.tsx`
- `lib/admin/page-params.ts` עם סכמות zod
- rename מיגרציה `007_categories_icon_url` → `0075` (התנגשות prefix עם `007_orders`)
- `type-check` עובר נקי

Session 2026-06-19 — Homepage 1:1 מול `ke_live_singlefile.html`:
- `scripts/compare.mjs` משתמש ב-`ke_live_singlefile.html`; `refs/live.png` מול `refs/mine.png` ב-1440px
- `HeroSection`: סליידר בלבד 422px, `HERO_SINGLEFILE_SLIDES`, rs-19 פעיל; בלי סיידבר/באנרים (sf-hidden במקור)
- `HeroSlider`: active slide = rs-19 (אפליקציה בקרוב)
- `CategoryStrip`: 5 קטגוריות בלבד
- `BenefitBar`: 5 פריטים מ-`.features-list`, מסגרת `#ddd` radius 8px
- `DealsOfTheDay`: גריד 4 עמודות, 6 מוצרים סטטיים מ-`KE_LIVE_DEALS` + השלמה מ-DB, בלי כותרת "דילים של היום"
- `(store)/page.tsx`: hero → categories → benefits → grid (בלי `CategoryProductSection`)
- `ke-live-deals-data.ts`: 6 מוצרים בסדר DOM (כולל קופון טסט 8836)
- Header/TopBar: לוגו + ₪0 + עגלה; TopBar 4 פריטים (בלי חיפוש, לפי החלטת פרויקט)

commit: `feat: homepage 1:1 match with live source`

## In Progress
ממתין ל-Ofir: מילוי קובץ האב (`refs/KenyonExpress_קובץ_אב_דף_מוצר.docx`) לפני בניית `/products/[slug]`.

## Blocking Issues
- none חוסם. הערה: היסטוריית המיגרציות במרוחק לא מסונכרנת (2 רשומות מול 21 קבצים מקומיים). אין להריץ `supabase db push` למרוחק — ייכשל על "already exists". להחיל מיגרציות חדשות נקודתית דרך MCP `apply_migration` או `supabase migration repair`.
- Docker מקומי עדיין לא רץ (לא רלוונטי כל עוד עובדים מול המרוחק).

## Next Task
בניית `/products/[slug]` לפי מבנה דף המוצר הסופי (Groupon AMC + Electro), אחרי ש-Ofir ממלא את קובץ האב ב-`refs/`. כולל הוספת שדות חדשים ל-`products`: city, business_whatsapp, promo_code, options[], sold_count, redemption_steps, business_hours, waze_coords, supplier fields.

## Active Branch
phase5/homepage

## Working Directory ⛔ נתיב יחיד ונכון
`/Users/ofir/kenyonexpress-web/kenyonexpress` — שורש הפרויקט (כאן `package.json`, `.git`, `src/`). מבנה שטוח, **אין מקונן**.

**חוקים קבועים (גם ב-CLAUDE.md):**
1. אסור עותקים כפולים של הפרויקט (`* copy`, `src copy`, מבנה מקונן). גיבוי = git/GitHub בלבד.
2. אסור להריץ פקודות מתיקיות אחרות. לפני כל פעולה — לוודא `pwd` = הנתיב לעיל.
3. כל `git commit` מחייב `git push` מיידי ל-`origin phase5/homepage` כגיבוי.

## Supabase Project URL
https://ixvwfbuvfxxsjiywhbbb.supabase.co

---
## History

### 2026-07-08 - מיגרציה 025 consolidation הוחלה על המרוחק
- הוחל דרך Supabase MCP `apply_migration` על `ixvwfbuvfxxsjiywhbbb` (ACTIVE_HEALTHY)
- created_by re-assert (products/categories/coupons) + content_uploader RLS (products CRUD-minus-delete, categories select-only) + איחוד audit (58 שורות admin_audit_log -> audit_log, טבלה ישנה נמחקה, trigger fn שוכתבה) + 12 storage policies - הכול verified
- drift התגלה: `coupons` קיימת ב-DB החי למרות ש-008 מוחקת אותה בקבצים

### 2026-06-22 — מיגרציות 019/020/021 הוחלו על המרוחק
- הוחל דרך Supabase MCP `apply_migration` (לא `db push`, בגלל היסטוריה לא מסונכרנת)
- user_rate_limits + buckets products/coupons + product-images admin policies — verified
- DB מרוחק ACTIVE עם דאטה (12 קטגוריות, 31 מוצרים); חסם ה-DB הקודם בוטל

### 2026-06-19 — Homepage 1:1 match with live singlefile
- מבנה דף, hero rs-19, 5 קטגוריות, benefits, גריד מוצרים לפי faf8583
- compare loop: `node scripts/compare.mjs` (PLAYWRIGHT_BROWSERS_PATH ל-cache מקומי)

### 2026-06-12 — CategoryNav removed, BenefitBar frame, ProductCard electro values
- commits על `phase5/homepage` לפני סגירת 1:1

### 2026-06-09 — Product catalog + hero 5 slides + foundation
- 31 מוצרים ב-DB, `scripts/compare.mjs` הוקם
