# Runbook: שבוע השקה

D-2 to D+7.

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
| D1 | entry gates 5/10 |
| D2 | D0 launch |
| D3 | no features D4-7 |
| D4 | stop rules |

## חלופות שנדחו

| חלופה | למה נדחתה |
|---|---|
| ads no consent | no |
| 10/10 required | 5/10 OK |

## סכמת DB

monitor orders/redeem.

## מקרי קצה

| # | מקרה | התנהגות |
|---|---|---|
| CE1 | outage ads | pause |
| CE2 | supplier | call |
| CE3 | redeem spike | checkout off |
| CE4 | D7 summary | required |
| CE5 | gate fail | no paid ads |

## פתוחות

| # | פער |
|---|---|
| O1 | 20% threshold |
