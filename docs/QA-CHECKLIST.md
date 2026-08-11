# QA Checklist (ידני)

P0/P1/P2; see e2e for automation.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
אין שינוי קוד. אין נגיעה בתיקייה הראשית. כסף: **agorot integer**; `platform_percent` פר מוצר בלי default.


```
docs/TESTING-STRATEGY.md
```

---

## החלטה

| # | הכרעה |
|---|---|
| D1 | P0 auth/checkout/account/redeem |
| D2 | P1 catalog/cart/legal |
| D3 | RTL+responsive all pages |
| D4 | redirect + enumeration tests |
| D5 | cron expiry credit |

## חלופות שנדחו

| חלופה | למה נדחתה |
|---|---|
| P2 before P0 | no |
| skip mobile | no |

## סכמת DB

states: orders, vouchers, redeem outcome.

## מקרי קצה

| # | מקרה | התנהגות |
|---|---|---|
| CE1 | rate limit fail open | known |
| CE2 | checkout disabled | banner |
| CE3 | double tab | idempotent |
| CE4 | expired voucher | cron+scan |
| CE5 | password rules | signup |

## פתוחות

| # | פער |
|---|---|
| O1 | e2e map |
