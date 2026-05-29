# KenyonExpress State

## Current Phase
**Phase 4 — Admin functional, moving to storefront**

## Last Completed
Session 2026-05-29 — Admin polish + data entry (commit `9ffc7ed`, pushed to `cursor/add-supabase-3c830`):
- Migration `007` (categories: `icon_url` + `name_en` columns) applied to Supabase
- Migration `008_product_pricing_coupon.sql` — adds `kenyon_price`, `full_price`, `is_coupon_enabled` to products
- `supplier_id` (was `vendor_id`) made optional: removed vendor select from `ProductForm`, removed from Zod schema + server action, `database.ts` updated to `string | null`
- Category slug auto-generates from English name (`name_en`) instead of Hebrew
- `CategoryDialog.tsx` — accessible `Dialog.Description` added
- Admin sidebar (`AdminSidebar.tsx`) — "+" quick-action button next to מוצרים, links to `/admin/products/new`, `aria-label="מוצר חדש"`
- First real categories created in the DB
- tsc --noEmit ✅ clean

## Migrations Status (Supabase)
- `001`–`011` ✅ רצו
- `007` ✅ רץ (categories icon_url + name_en)
- `008` ✅ רץ (kenyon_price, full_price, is_coupon_enabled)
- `012`–`015` ⏳ טרם הורצו

## In Progress
nothing

## Blocking Issues
none

## Next Task
1. צור מוצרים ראשונים בפאנל האדמין (`/admin/products/new`)
2. בנה עמוד מוצר בסטורפרונט (`src/app/(store)/products/[slug]/page.tsx`)

## Working Directory
/Users/ofir/kenyonexpress-web/kenyonexpress

## Supabase Project URL
not set

---
## History

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
