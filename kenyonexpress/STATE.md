# KenyonExpress State

## Current Phase
**Phase 3 — Admin Panel**

## Last Completed
Commit `215a01c` pushed ל-`cursor/add-supabase-3c830`:
- migrations 006-010: תיקון idempotency (set_updated_at defensive + TO authenticated ב-008)
- biome fixes: htmlFor/id ב-CategoryForm + ProductForm, void→undefined ב-DeleteButton

## Migrations Status (Supabase)
- `001` ✅ רץ (fresh DB only — לא idempotent by design)
- `002` ✅ רץ
- `003` ✅ רץ
- `004` ✅ רץ
- `005` ✅ רץ
- `006` ✅ רץ
- `007` ✅ רץ
- `008` ✅ רץ
- `009` ✅ רץ
- `010` ✅ רץ
- `011` ✅ רץ

## In Progress
nothing

## Blocking Issues
none

## Next Task
Phase 3 wrap-up — test admin panel (admin bootstrap הושלם):
1. התחבר בדפדפן כ-kenyonexpress@gmail.com ובדוק `/admin` (אמור להציג dashboard)
2. ודא CRUD: products, categories, vendors, orders, users
3. לאחר אימות — Phase 4: store frontend (product listing, cart, checkout + Cardcom)

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

### 2026-05-27 — Admin route: לא היה באג בקוד
- ה-route תקין: src/proxy.ts (Next 16 — middleware הוחלף ב-proxy) רץ ומגן על /admin
- proxy מפנה: ללא session → /login; משתמש לא-admin → / (דף הבית)
- הסיבה ל"נפילה לדף הבית": kenyonexpress@gmail.com היה role=customer
- תוקן: profiles.role → super_admin (via service-role key, user id 62c7f2a8…)
- נמחקה תיקיית src/app/admin הריקה (.gitkeep, לא הגדירה route)
- אימות UI סופי דורש התחברות בדפדפן (אין לי את הסיסמה לסימולציה)
