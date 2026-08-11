# Runbook: גיבוי ושחזור (PITR)

צעדים לאירוע. `BACKUP-RECOVERY.md`.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
אין שינוי קוד. אין נגיעה בתיקייה הראשית. כסף: **agorot integer**; `platform_percent` פר מוצר בלי default.


```
docs/BACKUP-RECOVERY.md
docs/INCIDENT-RESPONSE-RUNBOOK.md
```

---

## החלטה

| # | הכרעה |
|---|---|
| D1 | PITR vs scratch לפי תרחיש |
| D2 | checkout off + restore_to timestamp |
| D3 | MCP אחרי restore |
| D4 | dump מוצפן + תרגול |
| D5 | reconcile Cardcom לפני checkout |

## חלופות שנדחו

| חלופה | למה נדחתה |
|---|---|
| restore API | אדם ב-UI |
| db push | MCP |

## סכמת DB

אין DDL. אימות `orders`, `vouchers`.

## מקרי קצה

| # | מקרה | התנהגות |
|---|---|---|
| CE1 | timestamp לא ברור | עצור |
| CE2 | Cardcom חסר ב-DB | תיקון מתועד |
| CE3 | DB בלי Cardcom | freeze |
| CE4 | קוד שבור | rollback |
| CE5 | 500 credits/cron | נפרד |

## פתוחות

| # | פער |
|---|---|
| O1 | ייצוא Cardcom |
