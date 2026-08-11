# מדיניות גיבוי ושחזור (תפעול)

RPO/RTO ותרגול. ארכיטקטורה: `docs/ARCHITECTURE-BACKUP-DR.md`.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
אין שינוי קוד. אין נגיעה בתיקייה הראשית. כסף: **agorot integer**; `platform_percent` פר מוצר בלי default.


```
docs/BACKUP-RESTORE-RUNBOOK.md
docs/RUNBOOK-PRODUCTION.md
```

---

## החלטה

| # | הכרעה |
|---|---|
| D1 | Supabase Pro לפני Cardcom חי |
| D2 | PITR: RPO דקות; RTO ≤ 2 שע' |
| D3 | scratch: RPO ≤ 24 שע'; RTO ≤ 8 שע' עסקים |
| D4 | pg_dump מוצפן offsite |
| D5 | Vercel rollback = קוד בלבד |
| D6 | reconciliation Cardcom לפני checkout |

## חלופות שנדחו

| חלופה | למה נדחתה |
|---|---|
| daily בלי PITR | חלון אובדן |
| תיקון SQL כסף | Cardcom |
| git כגיבוי DB | לא |

## סכמת DB

אין DDL. `orders`, `payments`, `vouchers`, `wallet_ledger`, `schema_migrations`.

## מקרי קצה

| # | מקרה | התנהגות |
|---|---|---|
| CE1 | מיגרציה אחרי restore | MCP |
| CE2 | checkout ב-PITR | kill switch |
| CE3 | R2 | שחזור נפרד |
| CE4 | PITR מחוץ לחלון | offsite |
| CE5 | restore חלקי | אסור |

## פתוחות

| # | פער |
|---|---|
| O1 | תאריך תרגול ב-STATE |
