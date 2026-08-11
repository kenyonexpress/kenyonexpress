# Runbook: תגובה לתקריות

SEV ו-kill switches. `INCIDENT-PLAYBOOKS.md`.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
אין שינוי קוד. אין נגיעה בתיקייה הראשית. כסף: **agorot integer**; `platform_percent` פר מוצר בלי default.


```
docs/INCIDENT-PLAYBOOKS.md
docs/BACKUP-RESTORE-RUNBOOK.md
```

---

## החלטה

| # | הכרעה |
|---|---|
| D1 | SEV1 15 דק'; SEV2 1 שע' |
| D2 | lead + comms |
| D3 | postmortem STATE |
| D4 | ראיות לפני סגירה |

## חלופות שנדחו

| חלופה | למה נדחתה |
|---|---|
| war room | MVP |
| בלי postmortem | לא |

## סכמת DB

אין DDL. STATE + audit.

## מקרי קצה

| # | מקרה | התנהגות |
|---|---|---|
| CE1 | escalate | checkout off |
| CE2 | PITR | lead OK |
| CE3 | CVV | אסור |
| CE4 | rollback+schema | smoke |
| CE5 | false alarm | פתיחה |

## פתוחות

| # | פער |
|---|---|
| O1 | on-call |
