# תקציב ביצועים

CWV + KB budgets.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
אין שינוי קוד. אין נגיעה בתיקייה הראשית. כסף: **agorot integer**; `platform_percent` פר מוצר בלי default.


```
docs/ARCHITECTURE-PERFORMANCE.md
```

---

## החלטה

| # | הכרעה |
|---|---|
| D1 | LCP 2.5s CLS 0.1 |
| D2 | page KB limits |
| D3 | image budgets |
| D4 | cache rules |
| D5 | PR JS regression 10% |

## חלופות שנדחו

| חלופה | למה נדחתה |
|---|---|
| ignore CLS | no |
| client-heavy PDP | budget |

## סכמת DB

revalidate per ARCHITECTURE-PERFORMANCE.

## מקרי קצה

| # | מקרה | התנהגות |
|---|---|---|
| CE1 | hero GIF | approve |
| CE2 | cache money API | forbidden |
| CE3 | Black Friday | review |
| CE4 | compare pass LCP fail | field |
| CE5 | third party | consent |

## פתוחות

| # | פער |
|---|---|
| O1 | LH CI |
