# Runbook: Incidents

playbooks מרוכזים.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
אין שינוי קוד. אין נגיעה בתיקייה הראשית. כסף: **agorot integer**; `platform_percent` פר מוצר בלי default.


```
docs/INCIDENT-PLAYBOOKS.md
```

---

## החלטה

| # | הכרעה |
|---|---|
| D1 | stabilize |
| D2 | no SQL paid |
| D3 | SEV targets |
| D4 | scenario map |

## חלופות שנדחו

| חלופה | למה נדחתה |
|---|---|
| blind restore | PITR |
| open checkout | off |

## סכמת DB

commerce + migrations.

## מקרי קצה

| # | מקרה | התנהגות |
|---|---|---|
| CE1 | ISR up API down | SEV2 |
| CE2 | webhook | verify |
| CE3 | DNS | dig |
| CE4 | redeem | idempotent |
| CE5 | env rollback | redeploy |

## פתוחות

| # | פער |
|---|---|
| O1 | deploy doc merge |
