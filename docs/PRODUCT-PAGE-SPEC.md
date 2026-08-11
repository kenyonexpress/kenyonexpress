# מפרט דף מוצר (אדמין + PDP)

מסמך BINDING מצביע. פירוט: ARCHITECTURE-*.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
agorot integer; `platform_percent` **בלי default**; **No Escrow** (28.07).

מסמכים קשורים:

```
docs/ADMIN-PRODUCT-EDITOR-SPEC.md
docs/ADMIN-PRODUCT-PAGE-SPEC.md
docs/ARCHITECTURE-ADMIN-PRODUCT-FIELDS.md
docs/ARCHITECTURE-LEGAL-COMPLIANCE.md
docs/CONTRADICTIONS.md
```

---

## החלטה

| # | הכרעה |
|---|---|
| P1 | מסמך אחד לשדות אדמין + PDP. |
| P2 | `platform_percent` חובה; snapshot ל-`order_items`. |
| P3 | קופון: מקדמה בפלטפורמה; יתרה בעסק; **אין** Escrow. |
| P4 | `coupon_expiry_days` מינימום 120; `expires_at` מצולם. |
| P5 | ספק חובה לפרסום. |
| P6 | בלוק חוקי §14ג בכל PDP. |
| P7 | RTL; מחירים כולל מע"מ. |

---

## חלופות שנדחו

| חלופה | למה נדחתה |
|---|---|
| עמלה 10% קבועה | C1 |
| Escrow / held / J5 | 28.07 |
| `expiry_days` עמודה שנייה | קנוני: coupon_expiry_days |

---

## סכמת DB

```text
products, suppliers, product_variants, order_items, vouchers
טיוטה 081: delivery_days, offer_valid_until, lat/lng
```

---

## מקרי קצה

| # | מקרה | התנהגות |
|---|---|---|
| CE1 | publish בלי percent | חסימה |
| CE2 | expiry < 120 | חסימה (יעד) |
| CE3 | קופון פג | wallet credit מלא |

---

## פתוחות

| # | פתוח | הערה |
|---|---|---|
| O1 | מיגרציה 081 | legal + geo |
| O2 | backfill percent | 61 מוצרים |

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-08-12 | batch-2: BINDING pointer |
