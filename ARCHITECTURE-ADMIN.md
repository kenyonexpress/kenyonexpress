# ארכיטקטורה: Admin (מצביע BINDING)

סקירה קצרה לליבת אדמין. פירוט ב-docs/.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.  
מודל כסף: **No Escrow**; `platform_percent` פר מוצר בלי default; אגורות integer.

**מקור קנוני:**

```
docs/ARCHITECTURE-ADMIN.md
```

Dump ארוך: git history לפני 2026-08-12.

---

## החלטה

| # | הכרעה |
|---|---|
| AD1 | Next.js `(admin)` + Supabase RLS + Server Actions. |
| AD2 | `platform_percent` דינמי פר מוצר; snapshot ב-`order_items`. |
| AD3 | קופון: `coupon_price` מוחלט; prepaid מלא באתר; No Escrow. |
| AD4 | RBAC: `requireSection`; כסף = admin tier. |
| AD5 | Orders: split ledger מ-snapshot; לא recompute מ-product חי. |
| AD6 | Cardcom webhook = מקור אמת paid; reconcile idempotent. |

---

## חלופות שנדחו

| חלופה | למה נדחתה |
|---|---|
| root duplicate כמקור אמת | docs/ARCHITECTURE-ADMIN קנוני. |
| percent קבוע 5%/10% | AD2: פר מוצר. |
| Escrow על מקדמת קופון | No Escrow. |
| authenticated write ישיר על money tables | service role אחרי gate. |
| WP bulk import UI ב-Core | WP migration docs. |

---

## סכמת DB

```text
products, order_items, orders, payments, vouchers
suppliers, supplier_members, audit_log, user_roles
payout_statements, payout_statement_lines
```

אין DDL חדש.

---

## מקרי קצה

| # | מקרה | התנהגות |
|---|---|---|
| CE1 | publish בלי coupon_price | validation block. |
| CE2 | support export כסף | 403. |
| CE3 | refund post-redeem | block. |
| CE4 | percent change post-publish | orders חדשות; audit. |
| CE5 | suspend supplier | block redeem; unpublish. |

---

## פתוחות

| # | פתוח | הערה |
|---|---|---|
| O1 | coupon UI variants | docs/ARCHITECTURE-ADMIN O1. |
| O2 | content re-approval | post-publish edit. |
| O3 | legacy coupons route | cutover. |

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-07 | dump root |
| 2026-08-12 | batch-2: BINDING מצביע |
