# צירוף ספק (תפעול)

תקציר BINDING. פירוט:

```
docs/ARCHITECTURE-SUPPLIER-ONBOARDING.md
docs/ARCHITECTURE-SUPPLIER-PORTAL.md
docs/SUPPLIER-AGREEMENT-DRAFT.md
```

Status: **BINDING (guide)** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
No Escrow; אסור מילים: נאמן, Escrow, J5.

---

## החלטה

| # | הכרעה |
|---|---|
| SO1 | קופון: יתרה בקופה; **אין payout מהאתר** על קופון. |
| SO2 | פיזי: payout אחרי bank + agreement + engine (G1). |
| SO3 | מסמכים: ח.פ, כתובת, לוגו; בנק לפני payout פיזי. |
| SO4 | flow: pending → admin review → approved → supplier + owner member. |
| SO5 | scanner role לקופה; test coupon unpublished. |
| SO6 | מוצר ראשון: `platform_percent` **חובה**. |

---

## חלופות שנדחו

| חלופה | למה |
|---|---|
| auto-approve supplier | fraud |
| bank optional for physical launch | payout block |
| Escrow messaging | No Escrow |
| skip agreement | LT6 |

---

## סכמת DB

```text
suppliers: status (pending/approved/rejected/suspended)
supplier_members: role owner/scanner
supplier_documents (storage private)
products: supplier_id, platform_percent
```

---

## מקרי קצה

| # | מקרה |
|---|---|
| CE1 | reject → cooldown reapply |
| CE2 | approved sans bank + physical SKU | block payout not scan |
| CE3 | owner leaves company | role transfer admin |
| CE4 | duplicate ח.פ | manual merge |
| CE5 | test redeem on prod coupon | use unpublished test |

---

## פתוחות

| # | פתוח |
|---|---|
| O1 | self-serve portal upload |
| O2 | training video QR |

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-08-12 | batch-2: BINDING |
