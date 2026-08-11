# צ'קליסט Code Review

לפני merge.

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
| D1 | why in PR |
| D2 | agorot + money module |
| D3 | platform_percent |
| D4 | RLS + redeem |
| D5 | RTL + compare.mjs |

## חלופות שנדחו

| חלופה | למה נדחתה |
|---|---|
| float money | no |
| pl/pr | logical |

## סכמת DB

migrations idempotent + RLS.

## מקרי קצה

| # | מקרה | התנהגות |
|---|---|---|
| CE1 | docs only | N/A compare |
| CE2 | admin route | session |
| CE3 | held/J5 text | reject |
| CE4 | no tests money | add |
| CE5 | secrets in diff | block |

## פתוחות

| # | פער |
|---|---|
| O1 | compare CI |
