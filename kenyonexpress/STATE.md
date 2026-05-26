# KenyonExpress State

## Current Phase
**Phase 3 — Admin Panel**

## Last Completed
כל migrations 001-011 רצו בהצלחה ב-Supabase. DB schema מלא בפרודקשן.

## In Progress
nothing

## Blocking Issues
none

## Next Task
Phase 3 wrap-up — bootstrap admin + test admin panel:
1. הרץ ב-Supabase SQL Editor: `UPDATE public.profiles SET role = 'admin' WHERE id = '<your-user-id>';`
2. הפעל את הפרויקט מקומית (`pnpm dev`) ובדוק `/admin`
3. ודא שכל ה-CRUD routes עובדים (products, categories, vendors, orders, users)
4. לאחר אימות — Phase 4: store frontend (product listing, cart, checkout + Cardcom)

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
