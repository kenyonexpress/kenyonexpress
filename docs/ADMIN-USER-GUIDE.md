# מדריך אדמין (תפעול)

תקציר BINDING לתפעול יומי. פירוט מסכים:

```
docs/ARCHITECTURE-ADMIN-DASHBOARD.md
docs/ADMIN-PRODUCT-PAGE-SPEC.md
docs/ARCHITECTURE-PRICING-RULES.md
```

Status: **BINDING (guide)** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
כניסה: `/admin` · RTL עברית.

---

## החלטה

| # | הכרעה |
|---|---|
| GU1 | `platform_percent` **חובה** לכל מוצר; אין default 5%. |
| GU2 | קופון: מחיר קופון + דיל; יתרה בעסק; **100% prepaid לפלטפורמה**; **No Escrow**. |
| GU3 | פיזי: מחיר מלא; split לפי percent; snapshot בדוחות. |
| GU4 | UI שקלים; DB אגורות. |
| GU5 | Publish רק אחרי validation; טיוטה לפני live. |
| GU6 | refund/payout: re-auth + audit. |

---

## חלופות שנדחו

| חלופה | למה נדחתה |
|---|---|
| percent ריק | C1: חסום publish. |
| טקסט Escrow/נאמן | No Escrow. |
| support marks payout | admin tier only. |

---

## סכמת DB

```text
products: platform_percent, coupon_price_agorot, supplier_id, product_type
suppliers: status, profile fields
order_items: snapshots
```

אין DDL חדש.

---

## מקרי קצה

| # | מקרה | פעולה |
|---|---|---|
| CE1 | coupon_price > deal | block publish |
| CE2 | refund after redeem | deny |
| CE3 | percent change live | new orders only |
| CE4 | stuck payment | reconcile |
| CE5 | suspended supplier | unpublish |

---

## פתוחות

| # | פתוח |
|---|---|
| O1 | product wizard UX |
| O2 | payout CSV export (G1) |

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-08-12 | batch-2: BINDING 5 סעיפים |
