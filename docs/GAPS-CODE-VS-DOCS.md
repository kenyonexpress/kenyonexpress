# GAPS-CODE-VS-DOCS

Status: **BINDING (audit)** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
מודל: **No Escrow**

---

## 1. החלטה (מחייבת)

| # | הכרעה |
|---|---|
| G1 | payout UI **מת** (tables/RPC null). |
| G2 | `voucher_redemptions` קנוני; לא `coupon_redemptions`. |
| G3 | **No Escrow**; supplier_due=0 על קופון. |
| G4 | gift = columns on `vouchers`. |

---

## 2. חלופות שנדחו

| חלופה | למה |
|---|---|
| old payout RPC | not applied |
| Escrow holds | No Escrow |

---

## 3. סכמת DB (פערים)

| object | prod |
|---|---|
| payout_statements | null |
| voucher_redemptions | exists |
| suppliers bank cols | none |

---

## 4. מקרי קצה

| # | מצב |
|---|---|
| E1 | admin payouts RPC fail |
| E2 | supplier_debit no offset |
| E3 | float cancellation fee (rule only) |

---

## 5. פתוחות

G1 payout (PAYOUT-MECHANISM); wallet agorot cutover.

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-08-12 | BINDING batch-2 |
