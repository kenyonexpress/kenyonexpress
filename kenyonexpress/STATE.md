# KenyonExpress State

## Current Phase
**Phase 5 — Homepage 1:1 (סגור)**. branch `phase5/homepage`. מקור יחיד: `refs/ke_live_singlefile.html`.

## Last Completed
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
nothing

## Blocking Issues
- none חוסם. הערה: היסטוריית המיגרציות במרוחק לא מסונכרנת (2 רשומות מול 21 קבצים מקומיים). אין להריץ `supabase db push` למרוחק — ייכשל על "already exists". להחיל מיגרציות חדשות נקודתית דרך MCP `apply_migration` או `supabase migration repair`.
- Docker מקומי עדיין לא רץ (לא רלוונטי כל עוד עובדים מול המרוחק).

## Next Task
בדיקה חיה של דף הקטגוריה מול המרוחק (יש דאטה: 12 קטגוריות, 31 מוצרים); אין `/categories` index page (breadcrumb לא מקשר אליו) — לשקול אם צריך.

## Active Branch
phase5/homepage

## Working Directory
/Users/ofir/kenyonexpress-web/kenyonexpress

## Supabase Project URL
https://ixvwfbuvfxxsjiywhbbb.supabase.co

---
## History

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
