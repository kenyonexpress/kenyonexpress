# הגדרות GitHub

branch protection + CI.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
אין שינוי קוד. אין נגיעה בתיקייה הראשית. כסף: **agorot integer**; `platform_percent` פר מוצר בלי default.


```
.github/workflows/ci.yml
```

---

## החלטה

| # | הכרעה |
|---|---|
| D1 | prod branch = Vercel |
| D2 | ruleset no bypass |
| D3 | 4 required checks |
| D4 | E2E after secrets |
| D5 | CI_SUPABASE secrets |

## חלופות שנדחו

| חלופה | למה נדחתה |
|---|---|
| direct push | no |
| E2E required early | stuck |

## סכמת DB

E2E uses test Supabase.

## מקרי קצה

| # | מקרה | התנהגות |
|---|---|---|
| CE1 | check name | re-add |
| CE2 | 0 approvals | PR still |
| CE3 | branch mismatch | fix Vercel |
| CE4 | coverage fail | fix tests |
| CE5 | fork PR | no secrets |

## פתוחות

| # | פער |
|---|---|
| O1 | add E2E required |
