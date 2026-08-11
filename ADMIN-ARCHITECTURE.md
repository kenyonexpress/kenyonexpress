# ADMIN-ARCHITECTURE (מצביע BINDING)

סקירה קצרה לדשבורד אדמין. פירוט מלא ב-docs/.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.  
מודל כסף: **No Escrow**; `platform_percent` פר מוצר בלי default; אגורות integer.

**מקורות קנוניים:**

```
docs/ARCHITECTURE-ADMIN.md
docs/ARCHITECTURE-ADMIN-DASHBOARD.md
docs/ARCHITECTURE-ADMIN-DASHBOARD-SPEC.md
docs/ADMIN-USER-GUIDE.md
```

Dump ארוך (2026-07): git history לפני 2026-08-12.

---

## החלטה

| # | הכרעה |
|---|---|
| A1 | Stack: Next.js `(admin)`, Supabase RLS, Server Actions + cron. |
| A2 | RBAC: `requireSection`; כסף = admin tier בלבד (`canSeeMoney`). |
| A3 | `platform_percent` + `coupon_price` פר מוצר, admin-only, snapshot ב-`order_items`. |
| A4 | קופון: מקדמה מוחלטת באתר; 100% לפלטפורמה; יתרה בעסק; No Escrow. |
| A5 | Publish gate: זהות ספק + money knobs + `assertPublishable`. |
| A6 | audit_log על publish, refund, role elevation. |

---

## חלופות שנדחו

| חלופה | למה נדחתה |
|---|---|
| `/api/admin/*` CRUD ציבורי | Server Actions + RBAC. |
| percent קבוע 5%/10% | פר מוצר, בלי default. |
| Escrow / held על מקדמת קופון | No Escrow; BUSINESS-MODEL. |
| support רואה GMV גלובלי | money visibility admin בלבד. |
| root `ADMIN-ARCHITECTURE` כמקור אמת | docs/ARCHITECTURE-ADMIN קנוני. |

---

## סכמת DB

```text
products (platform_percent, coupon_price_agorot, supplier_id, status)
order_items (snapshots כסף)
orders, payments, vouchers
suppliers, supplier_members, audit_log, user_roles
payout_statements (+ lines)
```

אין DDL חדש במסמך זה.

---

## מקרי קצה

| # | מקרה | התנהגות |
|---|---|---|
| CE1 | publish קופון בלי coupon_price | חסום validation. |
| CE2 | support מנסה export כסף | 403. |
| CE3 | refund על voucher redeemed | חסום. |
| CE4 | שינוי percent אחרי publish | הזמנות חדשות בלבד; audit. |
| CE5 | stuck payment + webhook מאוחר | reconcile idempotent. |

---

## פתוחות

| # | פתוח | הערה |
|---|---|---|
| O1 | coupon UI split variants | ARCHITECTURE-ADMIN O1. |
| O2 | content edit אחרי publish | re-approval? |
| O3 | cutover legacy `/admin/coupons` | ARCHITECTURE-ADMIN O3. |

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-07-27 | dump ארוך arch/admin-supplier |
| 2026-08-12 | batch-2: BINDING מצביע; 5 סעיפים |
