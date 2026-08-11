# ספר תפעול יומי

מוצר, ספק, webhook.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
אין שינוי קוד. אין נגיעה בתיקייה הראשית. כסף: **agorot integer**; `platform_percent` פר מוצר בלי default.


```
docs/RUNBOOK-OPERATIONS.md
```

---

## החלטה

| # | הכרעה |
|---|---|
| D1 | בוקר overview |
| D2 | percent חובה |
| D3 | verify path |
| D4 | checkout off בגל |

## חלופות שנדחו

| חלופה | למה נדחתה |
|---|---|
| ספק active זמני | לא |
| SQL paid | verify |

## סכמת DB

`products`, `orders`, `payments`, `vouchers`.

## מקרי קצה

| # | מקרה | התנהגות |
|---|---|---|
| CE1 | Vercel protection | fix |
| CE2 | charge no order | SEV |
| CE3 | webhook repeat | systemic |
| CE4 | missing percent | block |
| CE5 | 10 דק pending | wait |

## פתוחות

אין פתוחות (2026-08-12).

