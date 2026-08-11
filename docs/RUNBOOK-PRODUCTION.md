# מדריך תפעול: ייצור

Deploy + MCP.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
אין שינוי קוד. אין נגיעה בתיקייה הראשית. כסף: **agorot integer**; `platform_percent` פר מוצר בלי default.


```
docs/DEPLOY.md
```

---

## החלטה

| # | הכרעה |
|---|---|
| D1 | ship order |
| D2 | pnpm test build |
| D3 | MCP only prod |
| D4 | rollback rules |
| D5 | checkout false until test |

## חלופות שנדחו

| חלופה | למה נדחתה |
|---|---|
| db push | no |
| no smoke | no |

## סכמת DB

`schema_migrations`.

## מקרי קצה

| # | מקרה | התנהגות |
|---|---|---|
| CE1 | bad migration | PITR |
| CE2 | public Cardcom | rotate |
| CE3 | schema drift rollback | check |
| CE4 | MCP down | STATE |
| CE5 | early checkout | risk |

## פתוחות

| # | פער |
|---|---|
| O1 | MCP SLA |
