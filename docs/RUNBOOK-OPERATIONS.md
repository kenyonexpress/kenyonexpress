# Runbook: Operations

admin daily.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
אין שינוי קוד. אין נגיעה בתיקייה הראשית. כסף: **agorot integer**; `platform_percent` פר מוצר בלי default.


```
docs/OPERATIONS-RUNBOOK.md
```

---

## החלטה

| # | הכרעה |
|---|---|
| D1 | Chrome admin |
| D2 | percent snapshot |
| D3 | no manual paid |
| D4 | morning checks |

## חלופות שנדחו

| חלופה | למה נדחתה |
|---|---|
| global percent | per product |
| SQL update money | forbidden |

## סכמת DB

`order_items`, `orders`, `payments`.

## מקרי קצה

| # | מקרה | התנהגות |
|---|---|---|
| CE1 | percent edit | snapshot |
| CE2 | cross supplier | RLS |
| CE3 | 30m | incident |
| CE4 | refund | LEGAL |
| CE5 | DLQ | admin |

## פתוחות

אין פתוחות (2026-08-12).

