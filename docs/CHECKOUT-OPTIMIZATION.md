# אופטימיזציית Checkout

תקציר BINDING למשפך ו-A/B. פירוט:

```
docs/ARCHITECTURE-CART-CHECKOUT.md
docs/ARCHITECTURE-CHECKOUT-FLOW.md
docs/ANALYTICS-SPEC.md
```

Status: **BINDING (product)** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
No Escrow; סכום checkout = agorot.

---

## החלטה

| # | הכרעה |
|---|---|
| CO1 | 8 שלבי משפך: view → cart → checkout → identity → address → payment → return → QR. |
| CO2 | סכום עגלה = Cardcom (agorot); אין surprise. |
| CO3 | קופון: "משלמים עכשיו / יתרה בעסק" (AB-01). |
| CO4 | יעדי כיוון: view→cart ≥8%; cart→checkout ≥55%; →redirect ≥70%; →purchase ≥85%. |
| CO5 | סדר A/B: AB-01 → AB-03 → AB-02 → AB-08 → AB-05. |
| CO6 | אסור Escrow בקופי. |

---

## חלופות שנדחו

| חלופה | למה |
|---|---|
| הסתרת יתרה | שקיפות חובה |
| שינוי מחיר ב-redirect | אסור |
| guest checkout מלא | fraud; AB-06 מאוחר |

---

## סכמת DB

אין DDL. Events: `view_product`, `add_to_cart`, `begin_checkout`, `purchase`.

---

## מקרי קצה

| # | מקרה | התנהגות |
|---|---|---|
| CE1 | pending ארוך | מסך polling + reconcile |
| CE2 | מלאי נגמר | block redirect |
| CE3 | mobile summary | sticky CTA |
| CE4 | no QR post-purchase | deep link AB-08 |
| CE5 | Google abandon | cart saved |

---

## פתוחות

| # | פתוח |
|---|---|
| O1 | AB-06 guest coupon |
| O2 | baseline post soft-open |

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-08-12 | batch-2: BINDING |
