# ארכיטקטורת Admin (סקירה)

תקציר BINDING לדשבורד אדמין. פירוט RBAC, מסכים, publish gate:

```
docs/ARCHITECTURE-ADMIN.md
docs/ARCHITECTURE-ADMIN-DASHBOARD.md
docs/ARCHITECTURE-ADMIN-DASHBOARD-SPEC.md
docs/ADMIN-PRODUCT-PAGE-SPEC.md
```

Status: **BINDING (pointer)** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.  
מודל כסף: **No Escrow**; `platform_percent` admin-only, **בלי default**.

---

## החלטה

| # | הכרעה |
|---|---|
| AD1 | Stack: Next.js `(admin)`, Supabase RLS, Server Actions. |
| AD2 | `platform_percent` + `supplier_split_percent` **פר מוצר**, sum=100 CHECK; **אין default**. |
| AD3 | קופון: `coupon_price` מוחלט; prepaid באתר; **100% לפלטפורמה**; אין Escrow. |
| AD4 | Publish gate: supplier + money knobs + `assertPublishable`. |
| AD5 | RBAC: `requireSection`; כסף = admin tier (`canSeeMoney`). |
| AD6 | Orders/settlement: snapshot מ-`order_items`, לא recompute. |
| AD7 | Refund / role / payout mark → `requireRecentAuth(15)` + `audit_log`. |

---

## חלופות שנדחו

| חלופה | למה נדחתה |
|---|---|
| `/api/admin/*` CRUD ציבורי | Server Actions + RBAC. |
| percent קבוע 5%/10% | C1: פר מוצר. |
| קופון תמיד 100/0 locked | admin בוחר; 100/0 אפשרי אבל לא forced. |
| support רואה GMV גלובלי | money visibility admin only. |

---

## סכמת DB

```text
products: platform_percent, supplier_split_percent, coupon_price_agorot, supplier_id, status
order_items: snapshots (platform_percent, commission_agorot, paid_on_site_agorot)
orders, payments, vouchers, suppliers, supplier_members
audit_log, user_roles
```

אין DDL חדש במסמך זה.

---

## מקרי קצה

| # | מקרה | התנהגות |
|---|---|---|
| CE1 | publish בלי `platform_percent` | חסום. |
| CE2 | support export כסף | 403. |
| CE3 | refund על voucher redeemed | חסום. |
| CE4 | שינוי percent על published | הזמנות חדשות; audit. |
| CE5 | stuck payment | reconcile idempotent. |
| CE6 | suspend supplier | block redeem; unpublish. |

---

## פתוחות

| # | פתוח | הערה |
|---|---|---|
| O1 | coupon UI split display | Q-ADMIN-CORE-1. |
| O2 | content edit אחרי publish | re-approval? |
| O3 | legacy `/admin/coupons` cutover | Q-ADMIN-CORE-4. |

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-08-02 | feat/admin-core draft |
| 2026-08-10 | DEPRECATED → pointer |
| 2026-08-12 | batch-2: BINDING 5 סעיפים |
