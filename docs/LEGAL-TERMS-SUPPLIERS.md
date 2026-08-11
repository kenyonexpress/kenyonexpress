# הסכם ספקים (טיוטה)

תקציר BINDING לנוסח עברי. **לא ייעוץ משפטי.** פירוט:

```
docs/SUPPLIER-AGREEMENT-DRAFT.md
docs/ARCHITECTURE-SUPPLIER-ONBOARDING.md
docs/ARCHITECTURE-PAYOUT-MECHANISM.md
```

Status: **BINDING (draft)** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
No Escrow; `platform_percent` פר מוצר בלי default.

---

## החלטה

| # | הכרעה |
|---|---|
| LT1 | ספק מציע קופון/פיזי; KE **לא צד** לעסקה בבית העסק. |
| LT2 | `platform_percent` **פר מוצר**, snapshot; אין default גלובלי. |
| LT3 | קופון: prepaid באתר ל-KE; יתרה בעסק; **אין payout קופון**; **No Escrow**. |
| LT4 | פיזי: payout לפי settlement; T+N; סף מינימום; manual batch עד automation. |
| LT5 | מימוש QR חד-פעמי; `[חסר מנגנון]` על payout prod = לא להתחייב. |
| LT6 | counsel חותם לפני חתימת ספק. |

---

## חלופות שנדחו

| חלופה | למה |
|---|---|
| Escrow/נאמנות | C11א |
| payout קופון מהאתר | LT3 |
| percent 5% default | C1 |
| התחייבות payout לפני G1 | LT5 |

---

## סכמת DB

```text
products.platform_percent, coupon_price_agorot (snapshot → order_items)
settlement_events (payout פיזי)
suppliers: bank fields (when added)
```

---

## מקרי קצה

| # | מקרה |
|---|---|
| CE1 | chargeback post-payout → supplier_debit |
| CE2 | redeemed → no auto refund |
| CE3 | fraud scan → suspend |
| CE4 | percent change → old orders unchanged |
| CE5 | no bank → no physical payout batch |

---

## פתוחות

| # | פתוח |
|---|---|
| O1 | `[חסר מנגנון]` payout UI |
| O2 | counsel final Hebrew |

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-08-12 | batch-2: BINDING |
