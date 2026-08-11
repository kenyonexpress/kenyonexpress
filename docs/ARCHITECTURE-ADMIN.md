# ארכיטקטורה: Admin Core

ליבת דשבורד אדמין: RBAC, מוצרים, הזמנות, תשלומים, ספקים, audit.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.  
מודל כסף: **No Escrow**; `platform_percent` admin-only, snapshot ב-`order_items`.

מסמכים קשורים:

```
docs/ADMIN-PRODUCT-PAGE-SPEC.md
docs/ARCHITECTURE-ADMIN-DASHBOARD.md
docs/ARCHITECTURE-ADMIN-DASHBOARD-SPEC.md
docs/ARCHITECTURE-SUPPLIER-PORTAL.md
docs/ARCHITECTURE-SECURITY-COMPLIANCE.md
```

---

## החלטה

| # | הכרעה |
|---|---|
| AD1 | Stack: Next.js `(admin)`, Supabase RLS, Server Actions + cron RH. |
| AD2 | `platform_percent` דינמי פר מוצר, admin-only, בלי default DB; snapshot ברכישה. |
| AD3 | קופון: `coupon_price` מוחלט; prepaid מלא באתר; יתרה בעסק ב-QR; No Escrow. |
| AD4 | פיזי: split לפי snapshot; supplier payout דרך settlements. |
| AD5 | RBAC: `requireSection`; כסף = `canSeeMoney` admin tier בלבד. |
| AD6 | Publish gate: supplier identity + money knobs + `assertPublishable`. |
| AD7 | Orders: split ledger מ-snapshot; לא recompute מ-product חי. |
| AD8 | Payments stuck + reconcile; webhook Cardcom = מקור אמת paid. |
| AD9 | Sensitive: `requireRecentAuth(15)` ל-refund, role elevation, mark payout paid. |
| AD10 | כל publish/role/refund → `audit_log`. |

---

## חלופות שנדחו

| חלופה | למה נדחתה |
|---|---|
| `/api/admin/*` CRUD ציבורי | AD7: Server Actions + RBAC. |
| percent קבוע 5%/10% | AD2: פר מוצר. |
| support רואה GMV גלובלי | AD5: money visibility admin. |
| WP bulk import UI ב-Core | out of scope; WP docs. |
| authenticated write על money tables | service role / DEFINER אחרי gate. |

---

## סכמת DB

טבלאות מרכזיות (קיים):

```text
products (platform_percent, coupon_price_agorot, supplier_id, status)
order_items (snapshots: platform_percent, commission_agorot, paid_on_site_agorot)
orders, payments, vouchers
suppliers, supplier_members
audit_log, user_roles
payout_statements, payout_statement_lines
```

אין DDL חדש במסמך זה.

---

## מקרי קצה

| # | מקרה | התנהגות |
|---|---|---|
| CE1 | publish קופון בלי coupon_price | חסום; הודעת validation. |
| CE2 | support מנסה export CSV כסף | 403. |
| CE3 | refund על voucher redeemed | חסום; מדיניות SUPPORT. |
| CE4 | שינוי percent על מוצר published | הזמנות חדשות בלבד; audit. |
| CE5 | stuck payment + webhook מאוחר | reconcile idempotent. |
| CE6 | suspend supplier | block redeem; unpublish products. |

---

## פתוחות

| # | פתוח | הערה |
|---|---|---|
| O1 | coupon UI 100/0 או split אחר | Q-ADMIN-CORE-1. |
| O2 | content edit אחרי publish | re-approval? |
| O3 | cutover `/admin/coupons` legacy | Q-ADMIN-CORE-4. |

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-07-28 | Admin Core goal (Fable 5) |
| 2026-08-12 | batch-2: BINDING 5 סעיפים |
