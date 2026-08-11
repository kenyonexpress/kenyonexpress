# מפרט ייבוא ספקים מ-WordPress

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`

---

## החלטה

| # | הכרעה |
|---|---|
| SS1 | `suppliers` אמיתי לכל דיל. |
| SS2 | מקור: WooCommerce / vendor / ACF. |
| SS3 | whatsapp נפרד או נגזר מטלפון. |
| SS4 | lat/lng רק geocode מאומת. |
| SS5 | opening_hours jsonb או null. |
| SS6 | publish: supplierReadiness. |

---

## חלופות שנדחו

| חלופה | למה נדחתה |
|---|---|
| lat מזויף | SS4 |
| seed prod ללא Preview | SS7 |

---

## סכמת DB

```text
suppliers + vendor_map.csv → products.supplier_id
```

---

## מקרי קצה

| # | מקרה | התנהגות |
|---|---|---|
| CE1 | geocode fail | active; skip near |
| CE2 | lat בלי lng | block seed |

---

## פתוחות

| # | פתוח | הערה |
|---|---|---|
| O1 | DDL geo columns | migration |

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-08-12 | batch-2: BINDING 5 סעיפים |
