# WP-IMPORT Mapping (2026-08-07)

מיפוי שדות WordPress → KenyonExpress. No Escrow בייבוא.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`

מסמכים קשורים:

```
docs/ARCHITECTURE-WP-DATA-MIGRATION.md
docs/ARCHITECTURE-ADMIN-PRODUCT-FIELDS.md
docs/PRODUCT-FIELDS-RESEARCH.md
```

---

## 0. החלטה

| # | הכרעה |
|---|---|
| M1 | `type` קופון/פיזי מפורש; לא רק flag. |
| M2 | מחיר קופון מוחלט חובה. |
| M3 | `platform_percent` חובה לפני active; אין default. |
| M4 | Snapshots כסף לא רלוונטיים לייבוא קטלוג (רק מוצרים). |
| M5 | ספק readiness לפני publish. |

---

## 1. חלופות שנדחו

| חלופה | למה נדחתה |
|---|---|
| ניחוש coupon מ-sale% | באג quote/charge. |
| ייבוא הזמנות WP כ-paid בלי Cardcom | ledger שקרי. |

---

## 2. סכמת DB

`products`, `categories`, `suppliers`, `product_images`. Staging לפי WP migrations.

---

## 3. מקרי קצה

| קוד | תוצאה |
|---|---|
| `he_slug_conflict` | suffix |
| `empty_platform` | נשאר draft |
| `html_in_title` | strip |

---

## 4. פתוחות

| # | פתוח | שמרני |
|---|---|---|
| O1 | ייבוא ביקורות | אחרי קטלוג יציב |
| O2 | וריאנטים מורכבים | פיזי phase |

עודכן: 2026-08-12.

---

## 5. Revision

| תאריך | שינוי |
|---|---|
| 2026-08-12 | BINDING תמצית מיפוי |
