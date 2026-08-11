# Runbook: יום השקה

cutover kenyonexpress.co.il.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
אין שינוי קוד. אין נגיעה בתיקייה הראשית. כסף: **agorot integer**; `platform_percent` פר מוצר בלי default.


```
docs/LAUNCH-CHECKLIST.md
```

---

## החלטה

| # | הכרעה |
|---|---|
| D1 | T-1 gates |
| D2 | env before DNS |
| D3 | Cardcom smoke |
| D4 | DNS Vercel |
| D5 | checkout after smoke |

## חלופות שנדחו

| חלופה | למה נדחתה |
|---|---|
| DNS first | webhook |
| Friday cutover | avoid |

## סכמת DB

smoke orders/vouchers.

## מקרי קצה

| # | מקרה | התנהגות |
|---|---|---|
| CE1 | refund fail | stop |
| CE2 | cert | wait |
| CE3 | 0 verified | No-Go |
| CE4 | Preview env | prod only |
| CE5 | LP fail | no DNS |

## פתוחות

| # | פער |
|---|---|
| O1 | 5/10 verified |
