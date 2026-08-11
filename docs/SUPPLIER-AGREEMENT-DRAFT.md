# הסכם ספק (טיוטה טכנית)

תקציר BINDING ליועץ משפטי. **לא להחתמה כפי שהוא.** פירוט סעיפים:

```
docs/LEGAL-TERMS-SUPPLIERS.md
docs/BUSINESS-MODEL.md
docs/ARCHITECTURE-PAYOUT-MECHANISM.md
```

Status: **BINDING (technical draft)** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
No Escrow; agorot; snapshot percent.

---

## החלטה

| # | הכרעה |
|---|---|
| SA1 | KE = פלטפורמה; ספק = אספקה בבית העסק/משלוח. |
| SA2 | `platform_percent` NOT NULL per product; **no default**; snapshot on order. |
| SA3 | Coupon: `coupon_price` absolute; **100% to platform**; balance at business. |
| SA4 | Physical payout: `[חסר מנגנון]` until G1; do not commit dates to suppliers. |
| SA5 | Cancellation: `computeCancellationFee` in code; align counsel text. |
| SA6 | Forbidden words: נאמן, Escrow, held for supplier. |

---

## חלופות שנדחו

| חלופה | למה |
|---|---|
| advance to supplier on coupon | SA3 |
| global commission on supplier row | C1 |
| auto payout promises in draft | SA4/G1 |

---

## סכמת DB

```text
products.platform_percent, coupon_price_agorot
order_items: platform_percent, supplier_immediate_agorot
settlement_events.kind includes payout_settled
```

Missing prod: `payout_statements`, `generate_payout_statement`.

---

## מקרי קצה

| # | מקרה |
|---|---|
| CE1 | sign before payout engine | liability |
| CE2 | supplier interprets percent as global | per-product only |
| CE3 | double scan | technical + agreement |
| CE4 | physical refund after payout | debit next batch |

---

## פתוחות

| # | פתוח |
|---|---|
| O1 | `[חסר מנגנון]` section 3 payout |
| O2 | counsel rewrite indemnity/jurisdiction |

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-08-12 | batch-2: BINDING; shorten body |
