# שגרת בוקר (15 דקות)

כסף ראשון. `RUNBOOK-PRODUCTION.md`.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
אין שינוי קוד. אין נגיעה בתיקייה הראשית. כסף: **agorot integer**; `platform_percent` פר מוצר בלי default.


```
docs/OPS-RUNBOOK.md
```

---

## החלטה

| # | הכרעה |
|---|---|
| D1 | pending→webhooks→redeem→Sentry |
| D2 | pending >30 דק': GetLpResult |
| D3 | signature_valid = בלי ?s= |
| D4 | redeem רק success |

## חלופות שנדחו

| חלופה | למה נדחתה |
|---|---|
| 5 דק' pending | רעש |
| redeem ללא outcome | לא |

## סכמת DB

`orders`, `payment_webhook_events`, `voucher_redemptions`.

## מקרי קצה

| # | מקרה | התנהגות |
|---|---|---|
| CE1 | webhook invalid המוני | rotate secret |
| CE2 | already_redeemed | הדרכה |
| CE3 | invalid_signature | QR |
| CE4 | advisors | ticket |
| CE5 | pending late close | OK |

## פתוחות

| # | פער |
|---|---|
| O1 | G7 column name |
