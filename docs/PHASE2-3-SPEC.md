# Phase 2–3: וריאנטים + SEO + תגיות

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
`platform_percent` **בלי default**; agorot; **No Escrow**.

---

## החלטה

| # | הכרעה |
|---|---|
| V1 | וריאנט = מחיר+מלאי; agorot. |
| V2 | `platform_percent` על **האב**. |
| V3 | SEO + JSON-LD מאותם agorot. |
| V4 | תגיות לא משנות עמלה. |
| V5 | קופון Offer = מחיר אתר בלבד. |

---

## חלופות שנדחו

| חלופה | למה נדחתה |
|---|---|
| Escrow על variant | No Escrow |
| percent per variant | V2: phase עתידי |

---

## סכמת DB

```text
products.has_variants, variant_axes
product_variants.price_agorot, stock_quantity
product_tags + links (יעד)
```

---

## מקרי קצה

| # | מקרה | התנהגות |
|---|---|---|
| CE1 | בלי variant_id | חסום checkout |
| CE2 | `?variant=` | noindex |

---

## פתוחות

| # | פתוח | הערה |
|---|---|---|
| O1 | agorot cutover variants | migration |

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-08-12 | batch-2: BINDING 5 סעיפים |
