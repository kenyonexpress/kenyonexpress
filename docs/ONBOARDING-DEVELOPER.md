# מדריך מפתח חדש

pnpm, money, MCP, RTL.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
אין שינוי קוד. אין נגיעה בתיקייה הראשית. כסף: **agorot integer**; `platform_percent` פר מוצר בלי default.


```
docs/CONTRADICTIONS.md
docs/MASTER-INDEX.md
```

---

## החלטה

| # | הכרעה |
|---|---|
| D1 | repo layout src/supabase |
| D2 | pnpm only |
| D3 | agorot + percent |
| D4 | MCP prod migrations |
| D5 | compare.mjs home |
| D6 | read CONTRADICTIONS first |

## חלופות שנדחו

| חלופה | למה נדחתה |
|---|---|
| npm | broken |
| nested repo | no |
| float | no |

## סכמת DB

migrations + DB-SCHEMA.md.

## מקרי קצה

| # | מקרה | התנהגות |
|---|---|---|
| CE1 | ke-arch vs app root | paths |
| CE2 | MCP down | STATE |
| CE3 | no RLS PR | block |
| CE4 | Cardcom client | forbidden |
| CE5 | compare no build | 3311 start |

## פתוחות

| # | פער |
|---|---|
| O1 | packages/money |
