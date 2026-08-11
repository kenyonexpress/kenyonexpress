# פלייבוקי תקריות

Cardcom, Supabase, redeem, webhook, deploy, פריצה.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
אין שינוי קוד. אין נגיעה בתיקייה הראשית. כסף: **agorot integer**; `platform_percent` פר מוצר בלי default.


```
docs/INCIDENT-RESPONSE-RUNBOOK.md
```

---

## החלטה

| # | הכרעה |
|---|---|
| D1 | זיהוי→kill switch→תקשורת→שחזור |
| D2 | CHECKOUT_ENABLED=false |
| D3 | GetLpResult + audit |
| D4 | QR secret / outcomes |

## חלופות שנדחו

| חלופה | למה נדחתה |
|---|---|
| NOC | solo |
| מחיקת pending | audit |

## סכמת DB

`orders`, `payments`, `voucher_redemptions`.

## מקרי קצה

| # | מקרה | התנהגות |
|---|---|---|
| CE1 | Cardcom up | stuck finalize |
| CE2 | RLS | checkout off |
| CE3 | invalid_signature | QR |
| CE4 | deploy | rollback |
| CE5 | PII | counsel |

## פתוחות

| # | פער |
|---|---|
| O1 | health Cardcom |
