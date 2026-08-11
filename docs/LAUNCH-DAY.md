# LAUNCH-DAY

שלבים 1-10.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
אין שינוי קוד. אין נגיעה בתיקייה הראשית. כסף: **agorot integer**; `platform_percent` פר מוצר בלי default.


```
docs/RUNBOOK-LAUNCH-DAY.md
```

---

## החלטה

| # | הכרעה |
|---|---|
| D1 | checkout false until 8 |
| D2 | freeze CI PITR |
| D3 | env P0 |
| D4 | no db push / SQL paid |

## חלופות שנדחו

| חלופה | למה נדחתה |
|---|---|
| open early | test buy |
| surprise DDL | MCP plan |

## סכמת DB

no DDL on H unless planned.

## מקרי קצה

| # | מקרה | התנהגות |
|---|---|---|
| CE1 | CI red | stop |
| CE2 | email | Resend |
| CE3 | DNS | TTL |
| CE4 | LP dup | idempotent |
| CE5 | fail | rollback |

## פתוחות

אין פתוחות (2026-08-12).

