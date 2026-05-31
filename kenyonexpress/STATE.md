# KenyonExpress State

## Current Phase
**Phase 4 — Admin CRUDs complete, schema fully synced; storefront in progress**

## Last Completed
Session 2026-06-01 — Migrations 013/014/016/015 ran successfully on Supabase. All 5 Admin CRUDs complete (Categories / Vendors / Products / Coupon Deals / Orders), DB schema fully synced with the app code.

### Coupon deals wired end to end (homepage + public pages + admin CRUD):
- עמוד הבית (`(main)/page.tsx`) הוחלף מטבלת `coupons` הישנה ל-`coupon_deals` (מודל 10% אונליין / 90% בבית העסק)
- `CouponCard.tsx` נכתב מחדש ככרטיס דיל (תמונה, % הנחה, שם עסק, מחיר פלטפורם מול מחיר מקורי, מיקום), מקשר ל-`/coupons/[id]`
- נוצר עמוד רשימה ציבורי `(main)/coupons/page.tsx`
- נוצר עמוד פרט ציבורי `(main)/coupons/[id]/page.tsx` עם פירוק תשלום 10%/90% (כפתור הרכישה מסומן "בקרוב" עד חיבור תשלום)
- אומת שה-CRUD של האדמין ל-`coupon_deals` כבר מלא: רשימה/יצירה/עריכה/מחיקה רכה + טופס עם תצוגה מקדימה (`/admin/coupons`, `coupon-deals.ts`, `CouponDealForm.tsx`)
- tsc --noEmit ✅ + lint ✅
- ⏳ נותר: חיבור תשלום אמיתי (Cardcom) לכפתור הרכישה

### Session 2026-06-01 (earlier) — Migrations 013/014/015 fixed + products schema synced to code:
- מקור השגיאה `42703: column "status" does not exist` אותר: `013_vendors_v2.sql` יצר אינדקס על `vendors.status` שלא קיים ב-DB האמיתי
- הסכמה האמיתית ב-Supabase הוצלבה דרך MCP (`list_migrations` ריק: המיגרציות הורצו ידנית, ה-DB משקף את פלט `005` בלבד)
- `013_vendors_v2.sql` תוקן: נוספה עמודת `status` (text + CHECK pending/active/suspended) + `business_id`, `contact_email`, `contact_phone`, `address`, `bank_account`
- `014_products_v2.sql` תוקן: `vendor_id` → `supplier_id` (אינדקס + RLS), נוספה `is_active` ל-`product_variants`
- `016_products_code_sync.sql` נוצר: rename `title_he`→`name_he` ב-products ו-variants, הוספת `name_en/kenyon_price/full_price/is_coupon_enabled/sku/is_featured/images/deleted_at`, backfill של `kenyon_price` מ-`price_ils`
- `008_product_pricing_coupon.sql` נמחק (התנגשות מספר עם `008_coupons_schema.sql`, תוכנו נכלל ב-016)
- תוקנו 3 באגי קוד: `base_price` → `kenyon_price` ב-`admin/products/page.tsx` + `admin/page.tsx`, הוסר join שבור ל-`vendors`, עמוד הבית (`(main)/page.tsx` + `ProductCard.tsx`) עודכן ל-`name_he/kenyon_price/images`
- tsc --noEmit ✅ clean

## Migrations Status (Supabase)
- `001`–`011` ✅ רצו (ידנית; ה-DB תואם לפלט `005` עבור products)
- `008_product_pricing_coupon` ❌ נמחק (הוחלף ב-`016`)
- `012` ⏳ סטטוס לא ודאי (לא נדרש; השינויים מכוסים ב-013/016)
- `013` ✅ רץ בהצלחה (vendors v2: status + שדות עסק/בנק + RLS)
- `014` ✅ רץ בהצלחה (products v2: supplier_id, is_active, RLS, indexes)
- `016` ✅ רץ בהצלחה (products/variants סנכרון שמות + backfill kenyon_price)
- `015` ✅ רץ בהצלחה (coupon_deals + bucket + audit trigger)
- הסכמה מסונכרנת במלואה מול הקוד

## In Progress
nothing

## Blocking Issues
none (השגיאה `42703 column "status" does not exist` נפתרה ב-`013`)

## Next Task
1. הרץ ב-Supabase SQL Editor את ה-SQL המאוחד (013 + 014 + 016 + 015 לפי הסדר; אידמפוטנטי)
2. צור עסקת קופון ראשונה ב-`/admin/coupons/new` עם status=active ואמת שהיא מופיעה בעמוד הבית וב-`/coupons`
3. חבר תשלום אמיתי (Cardcom) לכפתור "רכישת קופון — בקרוב" ב-`(main)/coupons/[id]/page.tsx` (מודל: 10% אונליין, 90% בבית העסק)

## Working Directory
/Users/ofir/kenyonexpress-web/kenyonexpress

## Supabase Project URL
https://ixvwfbuvfxxsjiywhbbb.supabase.co

---
## History

### 2026-06-01 — Coupon deals wired end to end
- homepage + new public `/coupons` list + `/coupons/[id]` detail now read `coupon_deals` (10% model)
- `CouponCard` rewritten as a deal card; admin CRUD (`/admin/coupons`) confirmed complete
- purchase button stubbed ("בקרוב") pending Cardcom payment integration

### 2026-06-01 — Homepage coupons section fixed
- live `coupons` table cross-checked: columns are `expires_at` + `min_purchase` (not `ends_at`/`min_order_amount_ils`), `discount_type` CHECK = `percentage`/`fixed` (not `percent`)
- `(main)/page.tsx` + `CouponCard.tsx` aligned to the real `coupons` schema (query was failing silently and always rendered empty)
- discovered `src/lib/supabase/server.ts` `createClient` is NOT typed with the `Database` generic, so select strings are not type-checked: column correctness must be verified against the live DB
- open product decision logged: homepage uses `coupons` while admin manages `coupon_deals`

### 2026-06-01 — Migrations 013/014/015 fixed + products schema synced to code
- `status` error root cause: `013` indexed `vendors.status` which the live DB never had
- live schema cross-checked via Supabase MCP (`list_migrations` empty, DB = output of `005`)
- `013` adds `status` (+ business/contact/bank columns) before indexing; `014` uses `supplier_id` not `vendor_id` and adds `is_active` to variants
- new `016_products_code_sync.sql`: renames `title_he`→`name_he`, adds code columns, backfills `kenyon_price` from `price_ils`
- deleted duplicate `008_product_pricing_coupon.sql` (number clashed with `008_coupons_schema.sql`)
- code fixes: `base_price`→`kenyon_price`, removed broken `vendors` join, homepage + `ProductCard` migrated to `name_he/kenyon_price/images`

### 2026-05-26 -- Phase 3 blockers resolved
- 002, 003, 004, 005 מיגרציות תוקנו להיות idempotent
- קונפליקט 003 vs 005 (DROP TABLE products) נפתר
- פוליסות content_uploader הועברו ל-005 שם products נוצרת מחדש

### 2026-05-26 -- Migrations 006-011 idempotency fixed
- set_updated_at() defensive definition נוסף ל-006, 007, 008, 009, 010
- TO authenticated נוסף לכל פוליסות coupon_codes ב-008 (security fix)

### 2026-05-26 -- All migrations 001-011 applied to Supabase
- DB schema מלא: auth, RBAC, storage, products, wallet, orders, coupons, addresses, referrals, audit log
- Phase 3 admin panel components + routes קיימים בקוד, ממתינים לאימות

### 2026-05-27 — Admin route blocked
- .env.local תוקן: URL + ANON_KEY + SERVICE_ROLE_KEY
- pnpm dev רץ ב-localhost:3000
- העמוד הראשי עובד
- /admin לא נטען - נופל לעמוד הראשי
- בעיה: יש 2 תיקיות admin - src/app/(admin)/ ו-src/app/admin (ריקה)
- צריך למחוק את src/app/admin (הריקה) - rm -rf src/app/admin

### 2026-05-27 — Phase 3 complete
- Admin panel אומת: עובד כולל ניווט וסטטיסטיקות
- kenyonexpress@gmail.com = super_admin
- CRUD קטגוריות (כולל העלאת אייקון) קיים ומוכן
- Phase 4 מתחיל: store frontend

### 2026-05-27 — Phase 4 Admin CRUDs complete
- 4 migrations חדשות: 012 (categories v2), 013 (vendors v2), 014 (products v2), 015 (coupon_deals)
- Categories: tree view + dialog modal + auto-slug מעברית + soft delete
- Vendors: full CRUD + filters (VendorForm)
- Products: pagination + search + bulk actions + variants + auto-slug
- Coupon Deals: /admin/coupons — עסקאות 10% עם live preview
- Orders: date range filters
- i18n: admin namespace נוסף ל-he.json + en.json
- pnpm type-check + lint — ✅ clean

### 2026-05-27 — 003_rbac.sql verified
- CREATE TYPE public.user_role AS ENUM כבר קיים בתחילת הקובץ (שורות 8-13)
- עטוף ב-DO $$ EXCEPTION WHEN duplicate_object THEN NULL — idempotent מלא
- אין שינוי נדרש

### 2026-05-27 — Admin route: לא היה באג בקוד
- ה-route תקין: src/proxy.ts (Next 16 — middleware הוחלף ב-proxy) רץ ומגן על /admin
- proxy מפנה: ללא session → /login; משתמש לא-admin → / (דף הבית)
- הסיבה ל"נפילה לדף הבית": kenyonexpress@gmail.com היה role=customer
- תוקן: profiles.role → super_admin (via service-role key, user id 62c7f2a8…)
- נמחקה תיקיית src/app/admin הריקה (.gitkeep, לא הגדירה route)
- אימות UI סופי דורש התחברות בדפדפן (אין לי את הסיסמה לסימולציה)

### 2026-05-29 — Admin functional, first categories created
- Migration 007 (categories: icon_url + name_en) applied to Supabase
- Migration 008 added: kenyon_price, full_price, is_coupon_enabled לטבלת products
- vendor_id הפך אופציונלי: הוסר מ-ProductForm, מ-Zod schema, מ-server action; database.ts עודכן
- Category slug מחולל מ-name_en (אנגלית) במקום עברית
- AdminSidebar: כפתור "+" להוספת מוצר מהיר ליד "מוצרים"
- קטגוריות ראשונות נוצרו ב-DB
- commit 9ffc7ed pushed to cursor/add-supabase-3c830
