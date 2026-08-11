# תפעול יומי אחרי השקה

reconcile, refund, ספק. GetLpResult.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
אין שינוי קוד. אין נגיעה בתיקייה הראשית. כסף: **agorot integer**; `platform_percent` פר מוצר בלי default.


```
docs/OPS-DAILY-ROUTINE.md
docs/CARDCOM-ARCHITECTURE.md
```

---

## החלטה

| # | הכרעה |
|---|---|
| D1 | RBAC |
| D2 | reconciliation יומי |
| D3 | reconcile בקוד |
| D4 | refund LEGAL+Cardcom |
| D5 | pnpm / kenyonexpress root |

## חלופות שנדחו

| חלופה | למה נדחתה |
|---|---|
| support paid | אסור |
| npm | pnpm |

## סכמת DB

`orders`, `payments`, `vouchers`, `suppliers`.

## מקרי קצה

| # | מקרה | התנהגות |
|---|---|---|
| CE1 | paid בלי voucher | reconcile |
| CE2 | payout G1 | blocked |
| CE3 | refund redeemed | LEGAL |
| CE4 | vouchers table | env |
| CE5 | webhook miss | verify |

## פתוחות

| # | פער |
|---|---|
| O1 | payout prod |
