# מדיניות SLA תמיכה

MVP response times.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
אין שינוי קוד. אין נגיעה בתיקייה הראשית. כסף: **agorot integer**; `platform_percent` פר מוצר בלי default.


```
docs/CUSTOMER-SUPPORT-PLAYBOOK.md
```

---

## החלטה

| # | הכרעה |
|---|---|
| D1 | business hours IL |
| D2 | P0 first reply 4h |
| D3 | no CVV |
| D4 | refund admin path |
| D5 | supplier redeem 1h peak |

## חלופות שנדחו

| חלופה | למה נדחתה |
|---|---|
| 24/7 phone | no |
| auto compensation | case by case |

## סכמת DB

orders, vouchers read for agents.

## מקרי קצה

| # | מקרה | התנהגות |
|---|---|---|
| CE1 | abusive | escalate |
| CE2 | dup tickets | merge |
| CE3 | GDPR | export runbook |
| CE4 | outage | banner |
| CE5 | paid promise | verify first |

## פתוחות

| # | פער |
|---|---|
| O1 | WA SLA |
