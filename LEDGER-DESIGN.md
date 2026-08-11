# LEDGER-DESIGN

ארכיטקטורת ledger כפול-רישום. **No Escrow** על קופון.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
Branch design: `arch/money-ledger`

---

## 1. החלטה (מחייבת)

| # | הכרעה |
|---|---|
| L1 | **bigint agorot** + **basis points**; אין numeric חדש. |
| L2 | snapshot מ-`order_items` בלבד ב-settlement. |
| L3 | **קופון No Escrow:** מקדמה = `platform_revenue`; `supplier_payable=0`. |
| L4 | **פיזי:** `supplier_payable` + payout batch (T+3). |
| L5 | `fn_post_journal` idempotent; sum-zero per journal. |
| L6 | VAT 17% על עמלת פלטפורמה בלבד (`extractVat`). |

---

## 2. חלופות שנדחו

| חלופה | למה |
|---|---|
| Escrow / `escrow_holds` על קופון | No Escrow (C11) |
| `escrow_held` account active | legacy 0 |
| float rounding | half-up integer |
| read live `products.platform_percent` | snapshot |
| J5 / external escrow | C3 |

---

## 3. סכמת DB

| migration | content |
|---|---|
| 058 | ledger_accounts, journals, lines |
| 059 | agorot + bp columns |
| 060 | idempotency_keys |
| 061 | single-use coupon |
| 062 | settlement_batches |
| 063 | reconciliation |
| 064 | RLS |

### chart (summary)

| kind | role |
|---|---|
| `cardcom_clearing` | asset |
| `platform_revenue` | income (net VAT) |
| `vat_output` | liability |
| `supplier_payable` | per supplier (physical) |
| `customer_wallet` | per user |

---

## 4. מקרי קצה

| # | event |
|---|---|
| E1 | duplicate journal key | no-op |
| E2 | redeem after expiry | wallet credit (C6) |
| E3 | refund physical | supplier_debit |
| E4 | partial refund | proportional lines |
| E5 | wallet + card split | two legs |
| E6 | coupon redeem | no supplier payable |

---

## 5. פתוחות

| # | פער |
|---|---|
| O1 | 058-065 not applied prod |
| O2 | code cutover to agorot |
| O3 | remove escrow posting rules from stale comments |

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-08-12 | No Escrow; escrow sections rejected |
| 2026-07-27 | C11 escrow text **superseded** |
